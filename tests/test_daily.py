from aikido.commands.daily import DailyCapture, week_of


def test_week_of():
    assert week_of("2026-07-19") == "2026-W29"


def test_save_and_aggregate(tmp_path):
    cap = DailyCapture(tmp_path)
    cap.save(
        {
            "date": "2026-07-13",
            "type": "shipping",
            "ships": "Shipped SSO login",
            "blockers": "none",
            "customer": "Acme asked about pricing seats",
            "takeaway": "Pricing keeps coming up",
        }
    )
    cap.save(
        {
            "date": "2026-07-14",
            "type": "firefighting",
            "ships": "none",
            "blockers": "Payment webhook flaky",
            "customer": "none",
            "takeaway": "Need better observability",
        }
    )

    out = cap.aggregate("2026-W29")

    decisions = out["decisions"].read_text()
    blockers = out["blockers"].read_text()
    signals = out["customer_signals"].read_text()
    summary = out["daily_summary"].read_text()

    assert "Shipped SSO login" in decisions
    assert "Payment webhook flaky" in blockers
    assert "Acme asked about pricing seats" in signals
    assert "Pricing keeps coming up" in summary


def test_tags_derived_from_content(tmp_path):
    cap = DailyCapture(tmp_path)
    path = cap.save(
        {
            "date": "2026-07-15",
            "type": "shipping",
            "ships": "none",
            "blockers": "none",
            "customer": "Talked about pricing and churn",
            "takeaway": "ok",
        }
    )
    content = path.read_text()
    assert "#pricing" in content
    assert "#churn" in content
