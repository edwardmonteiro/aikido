from datetime import date, timedelta

from conftest import signup


def make_baby(client, auth, **kw):
    body = {"name": "Lia", "birth_date": "2026-06-01", "sex": "female", **kw}
    r = client.post("/api/babies", json=body, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_register_login_and_me(client):
    auth = signup(client)
    assert client.get("/api/me", headers=auth).json()["email"] == "ana@example.com"
    assert client.post("/api/auth/register", json={"email": "ANA@example.com", "name": "x",
                                                   "password": "segredo123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "ana@example.com",
                                                "password": "errada000"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "Ana@Example.com", "password": "segredo123"})
    assert r.status_code == 200


def test_requires_auth(client):
    assert client.get("/api/babies").status_code == 401
    assert client.get("/api/babies", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_babies_are_private(client, auth):
    baby = make_baby(client, auth)
    other = signup(client, "bia@example.com")
    assert client.get(f"/api/babies/{baby['id']}", headers=other).status_code == 404
    assert client.get("/api/babies", headers=other).json() == []
    assert client.delete(f"/api/babies/{baby['id']}", headers=other).status_code == 404


def test_future_birth_date_rejected(client, auth):
    future = (date.today() + timedelta(days=2)).isoformat()
    r = client.post("/api/babies", json={"name": "X", "birth_date": future, "sex": "male"}, headers=auth)
    assert r.status_code == 422


def test_feedings_and_daily_summary(client, auth):
    baby = make_baby(client, auth, birth_date="2026-06-01", sex="female")
    bid = baby["id"]
    client.post(f"/api/babies/{bid}/weights", json={"measured_on": "2026-09-01", "weight_kg": 5.0}, headers=auth)
    # upsert same day
    client.post(f"/api/babies/{bid}/weights", json={"measured_on": "2026-09-01", "weight_kg": 5.5}, headers=auth)
    assert len(client.get(f"/api/babies/{bid}/weights", headers=auth).json()) == 1

    banana = next(f for f in client.get("/api/foods").json() if f["name"].startswith("Banana"))
    feeds = [
        {"fed_at": "2026-10-01T08:00:00-03:00", "kind": "formula", "amount_ml": 150},
        {"fed_at": "2026-10-01T12:00:00-03:00", "kind": "breast", "duration_min": 15},
        {"fed_at": "2026-10-01T15:00:00-03:00", "kind": "solid", "amount_g": 40, "food_id": banana["id"]},
        {"fed_at": "2026-10-01T23:30:00-03:00", "kind": "breast_milk", "amount_ml": 90},  # 02:30 UTC next day
        {"fed_at": "2026-10-02T09:00:00-03:00", "kind": "formula", "amount_ml": 100, "kcal": 70},
    ]
    for f in feeds:
        r = client.post(f"/api/babies/{bid}/feedings", json=f, headers=auth)
        assert r.status_code == 201, r.text

    s = client.get(f"/api/babies/{bid}/summary", params={"date": "2026-10-01"}, headers=auth).json()
    # 150*0.67 + 40*98/100 + 90*0.67 = 100.5 + 39.2 + 60.3
    assert s["total_kcal"] == 200.0
    assert s["feedings"] == 4
    assert s["unknown_kcal_feedings"] == 1
    assert s["age_months"] == 4
    assert s["weight_kg"] == 5.5
    assert s["target_kcal"] == round(82 * 5.5)
    assert s["by_kind"] == {"formula": 100.5, "solid": 39.2, "breast_milk": 60.3}

    day = client.get(f"/api/babies/{bid}/feedings", params={"date": "2026-10-01"}, headers=auth).json()
    assert [f["kind"] for f in day] == ["formula", "breast", "solid", "breast_milk"]
    assert day[0]["fed_at"].startswith("2026-10-01T11:00:00")

    # Same instant viewed from UTC lands the late feeding on Oct 2.
    s_utc = client.get(f"/api/babies/{bid}/summary", params={"date": "2026-10-02", "tz": "UTC"},
                       headers=auth).json()
    assert s_utc["total_kcal"] == round(60.3 + 70, 1)


def test_feeding_validation(client, auth):
    bid = make_baby(client, auth)["id"]
    url = f"/api/babies/{bid}/feedings"
    assert client.post(url, json={"fed_at": "2026-10-01T08:00:00", "kind": "formula", "amount_ml": 10},
                       headers=auth).status_code == 422  # naive datetime
    assert client.post(url, json={"fed_at": "2026-10-01T08:00:00Z", "kind": "formula"},
                       headers=auth).status_code == 422
    assert client.post(url, json={"fed_at": "2026-10-01T08:00:00Z", "kind": "solid", "amount_g": 10,
                                  "food_id": 99999}, headers=auth).status_code == 422
    assert client.get(f"/api/babies/{bid}/summary", params={"tz": "Mars/Base"},
                      headers=auth).status_code == 422


def test_history_and_deletes(client, auth):
    bid = make_baby(client, auth)["id"]
    h = client.get(f"/api/babies/{bid}/history", params={"days": 7}, headers=auth).json()
    assert len(h) == 7 and all(d["total_kcal"] == 0 for d in h)

    f = client.post(f"/api/babies/{bid}/feedings", json={"fed_at": "2026-10-01T08:00:00Z", "kind": "formula",
                                                          "amount_ml": 60}, headers=auth).json()
    other = signup(client, "bia@example.com")
    assert client.delete(f"/api/feedings/{f['id']}", headers=other).status_code == 404
    assert client.delete(f"/api/feedings/{f['id']}", headers=auth).status_code == 204
    assert client.delete(f"/api/babies/{bid}", headers=auth).status_code == 204
    assert client.get(f"/api/babies/{bid}", headers=auth).status_code == 404
