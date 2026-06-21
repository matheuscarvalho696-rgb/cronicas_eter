/*
Crônicas do Éter — Exportador Roll20 v41

O que ele faz:
- Exporta Characters e Handouts da campanha atual do Roll20.
- Pega nome, bio/notes, imagem/avatar e, opcionalmente, GM Notes.
- Cria/atualiza um handout chamado "CDE Export JSON" com o JSON pronto para colar no site.

Como instalar:
1) Abra a campanha no Roll20.
2) Vá em Settings > API Scripts.
3) Crie um novo script.
4) Apague o conteúdo padrão e cole este arquivo inteiro.
5) Clique em Save Script.
6) Volte para a mesa e digite no chat: !cde-export

Comandos:
!cde-help                         Mostra ajuda.
!cde-export                       Exporta personagens e folhetos ativos.
!cde-export --all                 Exporta também arquivados.
!cde-export --characters          Exporta só personagens.
!cde-export --handouts            Exporta só folhetos.
!cde-export --gmnotes             Inclui GM Notes no campo gmnotes.
!cde-export --selected            Exporta apenas personagens representados pelos tokens selecionados.

Observação: API Scripts exigem Roll20 Pro.
*/
var CDE_ROLL20_EXPORTER = CDE_ROLL20_EXPORTER || (function () {
  'use strict';

  var VERSION = '1.1.0';
  var EXPORT_HANDOUT_NAME = 'CDE Export JSON';

  function whisper(msg) {
    sendChat('CDE Exporter', '/w gm ' + msg);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, function (_, n) {
        try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return _; }
      });
  }

  function htmlToPlain(value) {
    return decodeEntities(String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n'))
      .trim();
  }

  function getAsync(obj, prop, done) {
    try {
      obj.get(prop, function (value) { done(value || ''); });
    } catch (e) {
      try { done(obj.get(prop) || ''); } catch (err) { done(''); }
    }
  }

  function series(items, iterator, done) {
    var index = 0;
    var results = [];
    function next() {
      if (index >= items.length) return done(results);
      iterator(items[index], function (result) {
        if (result) results.push(result);
        index += 1;
        next();
      });
    }
    next();
  }

  function parseOptions(content) {
    var opts = {
      includeCharacters: true,
      includeHandouts: true,
      includeArchived: false,
      includeGmNotes: false,
      selectedOnly: false
    };
    var parts = String(content || '').split(/\s+/).slice(1);
    parts.forEach(function (p) {
      if (p === '--characters') opts.includeHandouts = false;
      if (p === '--handouts') opts.includeCharacters = false;
      if (p === '--all') opts.includeArchived = true;
      if (p === '--gmnotes') opts.includeGmNotes = true;
      if (p === '--selected') opts.selectedOnly = true;
    });
    return opts;
  }

  function isArchived(obj) {
    try { return !!obj.get('archived'); } catch (e) { return false; }
  }

  function selectedCharacterIds(msg) {
    var ids = {};
    (msg.selected || []).forEach(function (sel) {
      var tok = getObj('graphic', sel._id);
      if (!tok) return;
      var represents = tok.get('represents');
      if (represents) ids[represents] = true;
    });
    return ids;
  }

  function exportCharacter(ch, opts, done) {
    getAsync(ch, 'bio', function (bio) {
      getAsync(ch, 'gmnotes', function (gmnotes) {
        var row = {
          id: ch.id,
          roll20Id: ch.id,
          type: 'character',
          name: ch.get('name') || 'Personagem sem nome',
          bio: htmlToPlain(bio),
          imageUrl: ch.get('avatar') || '',
          avatar: ch.get('avatar') || '',
          controlledby: ch.get('controlledby') || '',
          inplayerjournals: ch.get('inplayerjournals') || '',
          archived: isArchived(ch)
        };
        if (opts.includeGmNotes) row.gmnotes = htmlToPlain(gmnotes);
        done(row);
      });
    });
  }

  function exportHandout(ho, opts, done) {
    getAsync(ho, 'notes', function (notes) {
      getAsync(ho, 'gmnotes', function (gmnotes) {
        var row = {
          id: ho.id,
          roll20Id: ho.id,
          type: 'handout',
          name: ho.get('name') || 'Folheto sem título',
          bio: htmlToPlain(notes),
          content: htmlToPlain(notes),
          imageUrl: ho.get('avatar') || '',
          avatar: ho.get('avatar') || '',
          inplayerjournals: ho.get('inplayerjournals') || '',
          archived: isArchived(ho)
        };
        if (opts.includeGmNotes) row.gmnotes = htmlToPlain(gmnotes);
        done(row);
      });
    });
  }

  function makePayload(charRows, handoutRows, opts) {
    var campaign = Campaign && Campaign();
    return {
      source: 'roll20-api-script',
      exporter: 'cronicas-do-eter',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      options: opts,
      campaign: {
        name: campaign ? (campaign.get('name') || '') : '',
        playerPageId: campaign ? (campaign.get('playerpageid') || '') : ''
      },
      characters: charRows || [],
      handouts: handoutRows || []
    };
  }

  function saveExportHandout(payload) {
    var json = JSON.stringify(payload, null, 2);
    var existing = findObjs({ _type: 'handout', name: EXPORT_HANDOUT_NAME })[0];
    var handout = existing || createObj('handout', {
      name: EXPORT_HANDOUT_NAME,
      inplayerjournals: '',
      controlledby: ''
    });

    var html = '' +
      '<h3>Crônicas do Éter — Export Roll20</h3>' +
      '<p><b>Data:</b> ' + escapeHtml(payload.exportedAt) + '</p>' +
      '<p>Copie todo o texto abaixo e cole na página <b>Mesas Roll20</b> do site.</p>' +
      '<textarea style="width:100%;height:560px;white-space:pre;font-family:monospace;font-size:12px;">' + escapeHtml(json) + '</textarea>';

    handout.set('notes', html);
    whisper('Exportação concluída. Abra o handout <b>' + EXPORT_HANDOUT_NAME + '</b>, copie o JSON e cole no site. Personagens: <b>' + payload.characters.length + '</b>. Folhetos: <b>' + payload.handouts.length + '</b>.');
  }

  function exportAll(msg) {
    var opts = parseOptions(msg.content);
    whisper('Exportando. Aguarde alguns segundos...');

    var allowedSelected = opts.selectedOnly ? selectedCharacterIds(msg) : null;
    if (opts.selectedOnly && Object.keys(allowedSelected).length === 0) {
      whisper('Nenhum token selecionado representa um personagem. Selecione tokens com personagem vinculado ou use <code>!cde-export</code>.');
      return;
    }

    var characters = opts.includeCharacters ? (findObjs({ _type: 'character' }) || []) : [];
    var handouts = opts.includeHandouts ? (findObjs({ _type: 'handout' }) || []) : [];

    characters = characters.filter(function (ch) {
      if (!opts.includeArchived && isArchived(ch)) return false;
      if (allowedSelected && !allowedSelected[ch.id]) return false;
      return true;
    });

    handouts = handouts.filter(function (ho) {
      if (ho.get('name') === EXPORT_HANDOUT_NAME) return false;
      if (!opts.includeArchived && isArchived(ho)) return false;
      return true;
    });

    series(characters, function (ch, next) { exportCharacter(ch, opts, next); }, function (charRows) {
      series(handouts, function (ho, next) { exportHandout(ho, opts, next); }, function (handoutRows) {
        saveExportHandout(makePayload(charRows, handoutRows, opts));
      });
    });
  }

  function help() {
    whisper('<b>Crônicas do Éter — Exportador Roll20 v' + VERSION + '</b><br>' +
      '<code>!cde-export</code> — exporta personagens e folhetos ativos.<br>' +
      '<code>!cde-export --characters</code> — só personagens.<br>' +
      '<code>!cde-export --handouts</code> — só folhetos.<br>' +
      '<code>!cde-export --selected</code> — só personagens dos tokens selecionados.<br>' +
      '<code>!cde-export --all</code> — inclui arquivados.<br>' +
      '<code>!cde-export --gmnotes</code> — inclui GM Notes.<br>' +
      '<br>Depois abra o handout <b>' + EXPORT_HANDOUT_NAME + '</b>, copie o JSON e cole no site.');
  }

  on('chat:message', function (msg) {
    if (msg.type !== 'api') return;
    if (msg.content.indexOf('!cde-export') === 0) exportAll(msg);
    if (msg.content === '!cde-help') help();
  });

  on('ready', function () {
    log('Crônicas do Éter — Roll20 Exporter v' + VERSION + ' carregado. Use !cde-export no chat.');
  });

  return { exportAll: exportAll, help: help };
}());
