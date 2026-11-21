/* LIMIAR — roteiro jogável do Ato 1 (fases 01–04) + salvamento offline.
 * Textos e flags vêm do GDD (data/levels.json); posições/ondas são deste protótipo.
 */
(function (global) {
  'use strict';
  const LIM = global.LIM;
  const lv = (id) => LIM.DATA.levels.find((l) => l.id === id);

  // Cada evento dispara quando Aren cruza `x`.
  LIM.STAGES = {
    1: {
      theme: 'street', width: 1560, lamps: true, music: 'explore',
      events: [
        { x: 40, tip: 'Mova-se com o analógico (setas / WASD).' },
        { x: 220, tip: 'SOCO (J) e CHUTE (K). O golpe só acerta na mesma faixa de profundidade.' },
        { x: 420, talk: [['aren', 'Esta caligrafia é minha... "Encontre Lira antes que o céu abra".']] },
        {
          x: 640, lock: [400, 880], lampsOut: true,
          talk: [['narrador', 'As lanternas se apagam. A sombra dos inimigos se move sozinha.']],
          tip: 'Segure DEFESA (L) para bloquear. DEFESA + direção = esquiva.',
          wave: [{ t: 'errante', x: 860, y: 210 }, { t: 'errante', x: 420, y: 238 }],
          clear: { talk: [['courier', 'Lira deixou o cachecol vermelho na saída norte.'], ['aren', 'Lira... então ela passou por aqui.']], flag: 'courier_saved' }
        },
        { x: 1100, tip: 'Bloqueie no ÚLTIMO instante antes do golpe para APARAR.' }
      ],
      npc: { t: 'courier', x: 700, y: 206 },
      exit: { x: 1500, label: 'SAÍDA NORTE' },
      reward: { steel: 40, text: 'Mapa do bairro · Defesa desbloqueada' }
    },
    2: {
      theme: 'warehouse', width: 1640,
      crates: [[330, 206], [360, 236], [760, 200], [1260, 240], [1300, 204]],
      events: [
        { x: 60, talk: [['aren', 'Armazém 9. O mapa do canal deve estar aqui dentro.']] },
        { x: 240, tip: 'Combo SOCO, SOCO, CHUTE derruba. Caixas podem esconder cura.' },
        { x: 560, lock: [320, 800], doors: true, wave: [{ t: 'errante', x: 790, y: 206 }, { t: 'errante', x: 790, y: 240 }] },
        {
          x: 1060, lock: [820, 1300], doors: true,
          talk: [['aren', 'Estes guardas vestem o símbolo da minha antiga ordem.']],
          tip: 'O GUARDA bloqueia socos de frente: use CHUTE, ataque pelas costas ou CHUTE, CHUTE, SOCO.',
          wave: [{ t: 'guarda', x: 1290, y: 222 }, { t: 'errante', x: 830, y: 208 }]
        }
      ],
      exit: { x: 1580, label: 'PORTÃO DE CARGA' },
      reward: { steel: 120, text: 'Mapa do Canal · 120 fragmentos de aço' },
      flag: 'warehouse_cleared'
    },
    3: {
      theme: 'rooftop', width: 1760, rain: true,
      events: [
        { x: 60, talk: [['aren', 'Os telhados... alguém está fugindo com o fragmento.']] },
        { x: 440, lock: [200, 680], wave: [{ t: 'errante', x: 670, y: 214 }, { t: 'errante', x: 210, y: 236 }] },
        { x: 820, tip: 'Algo brilha perto do observatório, no alto do telhado (opcional).' },
        {
          x: 1320, lock: [1080, 1560],
          talk: [['narrador', 'O perseguidor para sob a chuva e saca a lâmina.']],
          tip: 'O DUELISTA apara golpes repetidos. Alterne SOCO e CHUTE.',
          wave: [{ t: 'duelista', x: 1550, y: 222 }]
        }
      ],
      memory: { x: 1000, y: 197, id: 'memory_1', talk: [['eco', 'Fui eu quem assinou o bloqueio da Aurora.']] },
      exit: { x: 1700, label: 'SAÍDA' },
      reward: { steel: 60, text: 'Esquiva aprimorada' },
      flag: 'memory_rooftop',
      perk: 'dodge'
    },
    4: {
      theme: 'gate', width: 480, boss: true,
      events: [
        { x: 0, talk: [['narrador', 'O Portão do Sino. Um vigia de bronze ainda guarda a passagem.'], ['aren', 'Você também usa o símbolo da ordem.'], ['vigia', 'Ninguém atravessa. Foram suas ordens, guardião.']] }
      ],
      bossSpawn: { t: 'vigia', x: 360, y: 222 },
      tips: ['Martelo erguido = marca amarela no chão. Saia da marca ou APARE no impacto.'],
      surrender: [['vigia', 'Não me derrote para me apagar. Lembre por que fiquei aqui.']],
      flag: 'boss_bronze'
    }
  };
  Object.keys(LIM.STAGES).forEach((k) => { LIM.STAGES[k].meta = lv(Number(k)); });

  // ---- salvamento (localStorage, protegido) ---------------------------------------------
  const KEY = 'limiar-save-v1';
  const fresh = () => ({ unlocked: 1, done: {}, steel: 0, eco: 0, memories: [], flags: {}, choices: {}, perks: {} });
  LIM.Save = {
    data: fresh(),
    load() {
      try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.done) this.data = Object.assign(fresh(), s); } catch (e) { /* sem storage */ }
      return this.data;
    },
    write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignora */ } },
    exists() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
    reset() { this.data = fresh(); this.write(); }
  };
  LIM.Save.load();
})(window);
