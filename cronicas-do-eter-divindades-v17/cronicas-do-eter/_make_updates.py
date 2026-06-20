from pathlib import Path
import re, zipfile, os, shutil
root=Path('/mnt/data/sitework/cronicas-do-eter')
nav='''<nav>
  <a href="index.html" class="nav-brand">Crônicas do Éter</a>
  <button class="nav-toggle" aria-label="Abrir menu">☰</button>
  <ul class="nav-links">
    <li><a href="index.html#sobre">O Sistema</a></li>
    <li><a href="crie-personagem.html">Crie seu Personagem</a></li>
    <li><a href="racas.html">Raças</a></li>
    <li><a href="classes.html">Classes</a></li>
    <li><a href="especializacoes.html">Especializações</a></li>
    <li><a href="habilidades.html">Habilidades</a></li>
    <li><a href="talentos.html">Talentos</a></li>
    <li><a href="mercado.html">Mercado</a></li>
    <li><a href="criacao-equipamentos.html">Criação de Equipamentos</a></li>
    <li><a href="divindades.html">Divindades</a></li>
    <li><a href="calculadora.html" class="tool-link">⚙ Calculadora XP/PT</a></li>
  </ul>
</nav>'''
# replace root page nav only
for fn in ['index.html','racas.html','classes.html','mercado.html','criacao-equipamentos.html','calculadora.html']:
    p=root/fn
    if p.exists():
        s=p.read_text(encoding='utf-8')
        s=re.sub(r'<nav>.*?</nav>', nav, s, count=1, flags=re.S)
        # active classes simple
        page=fn
        s=s.replace(f'href="{page}"', f'href="{page}" class="active"', 1) if page!='index.html' else s
        p.write_text(s,encoding='utf-8')
# update index tool link/button maybe absolute good
s=(root/'index.html').read_text(encoding='utf-8')
s=s.replace('<a href="calculadora.html" class="btn-secondary">⚙ Calculadora XP/PT</a>','<a href="calculadora.html" class="btn-secondary">⚙ Calculadora XP/PT</a>')
# Insert new cards in ferramentas section if exists, otherwise before cta-final. simpler append new section before footer.
extra_section='''\n<section id="novas-ferramentas">
  <div class="container">
    <div class="reveal" style="text-align:center;">
      <p class="section-label">Ferramentas e Compêndio</p>
      <h2 class="section-title">Acesse as novas áreas</h2>
      <p class="section-intro" style="margin:0 auto;">Crie personagens, consulte habilidades, talentos, especializações e acompanhe páginas futuras do sistema.</p>
    </div>
    <div class="card-grid reveal">
      <a href="crie-personagem.html" class="class-link-card"><span class="class-link-glyph">🧾</span><span class="class-link-name">Crie seu Personagem</span><p class="class-link-role">Escolha raça, variante e classe para gerar uma ficha rápida.</p><span class="class-link-cta">Abrir →</span></a>
      <a href="habilidades.html" class="class-link-card"><span class="class-link-glyph">✨</span><span class="class-link-name">Habilidades</span><p class="class-link-role">Entenda habilidades livres, exclusivas e perdidas.</p><span class="class-link-cta">Abrir →</span></a>
      <a href="especializacoes.html" class="class-link-card"><span class="class-link-glyph">⚔️</span><span class="class-link-name">Especializações</span><p class="class-link-role">Veja como as combinações de classes funcionam.</p><span class="class-link-cta">Abrir →</span></a>
      <a href="talentos.html" class="class-link-card"><span class="class-link-glyph">🌟</span><span class="class-link-name">Talentos</span><p class="class-link-role">Conheça a lógica dos talentos do sistema.</p><span class="class-link-cta">Abrir →</span></a>
      <a href="divindades.html" class="class-link-card"><span class="class-link-glyph">☀️</span><span class="class-link-name">Divindades</span><p class="class-link-role">Página reservada para o panteão futuro.</p><span class="class-link-cta">Abrir →</span></a>
    </div>
  </div>
</section>\n'''
if 'id="novas-ferramentas"' not in s:
    s=s.replace('<footer>', extra_section+'<footer>')
(root/'index.html').write_text(s,encoding='utf-8')

base_head='''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Crônicas do Éter</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="stars"></div>
'''
footer='''<footer>
  <span>Crônicas do Éter</span> — Sistema de RPG de Mesa
  <div class="footer-links">
    <a href="index.html">Início</a>
    <a href="calculadora.html">Calculadora XP/PT</a>
  </div>
</footer>
<script src="script.js"></script>
</body>
</html>
'''
def page(title, eyebrow, intro, body):
    n=nav.replace(f'href="{title.lower().replace(" ","-")}.html"','')
    return base_head.format(title=title)+nav+f'''\n<header class="page-header">
  <p class="breadcrumb"><a href="index.html">Início</a> / {title}</p>
  <p class="page-eyebrow">{eyebrow}</p>
  <h1 class="page-title">{title}</h1>
  <p class="page-intro">{intro}</p>
</header>\n'''+body+footer

crie='''<section>
  <div class="container">
    <div class="creator-layout reveal">
      <div class="lore-block creator-panel">
        <h3>Escolhas iniciais</h3>
        <label class="form-label">Nome do personagem</label>
        <input class="ether-input" id="charName" placeholder="Nome do personagem">
        <label class="form-label">Raça</label>
        <select class="ether-input" id="charRace"></select>
        <label class="form-label">Variante</label>
        <select class="ether-input" id="charVariant"></select>
        <label class="form-label">Classe</label>
        <select class="ether-input" id="charClass"></select>
        <button class="btn-primary" id="buildCharacter" style="margin-top:1rem;width:100%;">Gerar Ficha Rápida</button>
      </div>
      <div class="lore-block quick-sheet" id="quickSheet">
        <h3>Ficha rápida</h3>
        <p class="sheet-muted">Escolha raça, variante e classe para visualizar os dados básicos.</p>
      </div>
    </div>
  </div>
</section>
<script>
const raceData={
  "Anão":{variants:["Anão da Montanha","Anão da Forja","Anão das Profundezas"], base:["Deslocamento: 7,5 metros","Resistência física elevada","Aptidão natural com forja e mineração"]},
  "Argoniano":{variants:["Argoniano do Pântano","Argoniano Marinho","Argoniano do Deserto"], base:["Deslocamento: 9 metros","Adaptação natural a ambientes hostis","Instinto reptiliano e sobrevivência"]},
  "Celestial":{variants:["Celestial da Luz","Celestial da Aurora","Celestial do Julgamento"], base:["Deslocamento: 9 metros","Afinidade com energia divina","Presença luminosa e resistência espiritual"]},
  "Daedra":{variants:["Daedra Infernal","Daedra Sombrio","Daedra Nobre"], base:["Deslocamento: 9 metros","Afinidade com poder sombrio ou ígneo","Presença intimidadora"]},
  "Demônio":{variants:["Demônio do Caos","Demônio Abissal","Demônio Corruptor"], base:["Deslocamento: 9 metros","Natureza caótica","Resistência e manipulação sobrenatural"]},
  "Draconato":{variants:["Draconato de Fogo","Draconato de Raio","Draconato de Terra","Draconato de Água","Draconato de Vento"], base:["Deslocamento: 9 metros","Herança dracônica","Escamas e resistência elemental"]},
  "Elfo":{variants:["Elfo Lunar","Elfo da Floresta","Elfo Dourado","Drow"], base:["Deslocamento: 9 metros","Afinidade mágica","Sentidos aguçados e longevidade"]},
  "Humano":{variants:["Humano Versátil","Humano Determinado","Humano Erudito"], base:["Deslocamento: 9 metros","Grande adaptabilidade","Boa escolha para qualquer classe"]},
  "Mestiço":{variants:["Mestiço Comum","Mestiço Élfico","Mestiço Dracônico","Mestiço Daédrico"], base:["Deslocamento: 9 metros","Herança mista","Flexibilidade de construção"]},
  "Orc":{variants:["Orc Guerreiro","Orc Xamânico","Orc das Montanhas"], base:["Deslocamento: 9 metros","Força e resistência natural","Cultura marcial intensa"]},
  "Sylvan":{variants:["Sylvan Leão","Sylvan Tigre","Sylvan Cervo","Sylvan Raposa"], base:["Deslocamento: 9 metros","Traços bestiais","Instintos e sentidos aprimorados"]},
  "Quanti":{variants:["Quanti Primordial","Quanti Arcano","Quanti Etéreo"], base:["Deslocamento: 9 metros","Origem ancestral","Afinidade com forças primordiais"]}
};
const classData={
  "Arqueiro":{vida:"1d8", mana:"1d8", energia:"1d10", prof:"Destreza", papel:"Precisão à distância, mobilidade e controle de terreno."},
  "Bárbaro":{vida:"1d12", mana:"1d6", energia:"1d8", prof:"Força", papel:"Resistência, fúria e dano físico bruto."},
  "Bardo":{vida:"1d6", mana:"1d12", energia:"1d8", prof:"Carisma", papel:"Suporte, inspiração, música e magia versátil."},
  "Bruxo":{vida:"1d8", mana:"1d10", energia:"1d8", prof:"Carisma", papel:"Pactos, maldições e poder sombrio."},
  "Clérigo":{vida:"1d10", mana:"1d10", energia:"1d6", prof:"Sabedoria", papel:"Cura, proteção e poder divino."},
  "Feiticeiro":{vida:"1d6", mana:"1d10", energia:"1d10", prof:"Carisma", papel:"Magia inata, explosão arcana e linhagens."},
  "Guerreiro":{vida:"1d10", mana:"1d6", energia:"1d10", prof:"Força", papel:"Domínio marcial e versatilidade com armas."},
  "Ladino":{vida:"1d8", mana:"1d8", energia:"1d10", prof:"Destreza", papel:"Furtividade, precisão e ataques oportunistas."},
  "Mago":{vida:"1d6", mana:"1d12", energia:"1d8", prof:"Inteligência", papel:"Conhecimento arcano e escolas de magia."},
  "Monge":{vida:"1d10", mana:"1d6", energia:"1d10", prof:"Vigor", papel:"Corpo, mente, disciplina e mobilidade."},
  "Paladino":{vida:"1d12", mana:"1d6", energia:"1d8", prof:"Carisma", papel:"Juramento, proteção, justiça e combate sagrado."}
};
const raceSel=document.getElementById('charRace'), varSel=document.getElementById('charVariant'), clsSel=document.getElementById('charClass');
function fillSelect(sel, arr){sel.innerHTML=arr.map(x=>`<option value="${x}">${x}</option>`).join('');}
fillSelect(raceSel,Object.keys(raceData)); fillSelect(clsSel,Object.keys(classData));
function updateVariants(){fillSelect(varSel,raceData[raceSel.value].variants)}
raceSel.addEventListener('change',updateVariants); updateVariants();
function build(){const r=raceData[raceSel.value], c=classData[clsSel.value], n=document.getElementById('charName').value||'Personagem'; document.getElementById('quickSheet').innerHTML=`<h3>${n}</h3><div class="variant-meta"><span class="variant-tag">${raceSel.value}</span><span class="variant-tag">${varSel.value}</span><span class="variant-tag">${clsSel.value}</span></div><table class="spec-pair-table"><tbody><tr><td>Dado de Vida</td><td>${c.vida}</td></tr><tr><td>Dado de Mana</td><td>${c.mana}</td></tr><tr><td>Dado de Energia</td><td>${c.energia}</td></tr><tr><td>Proficiência Principal</td><td>${c.prof}</td></tr><tr><td>Deslocamento Base</td><td>9 metros, salvo ajuste racial</td></tr></tbody></table><div class="trait-grid" style="margin-top:1.2rem;">${r.base.map(x=>`<div class="trait-item"><strong>Raça</strong><span>${x}</span></div>`).join('')}<div class="trait-item"><strong>Classe</strong><span>${c.papel}</span></div></div><p style="margin-top:1rem;color:var(--mist);">Esta ficha rápida resume a base inicial. Detalhes completos de habilidades, talentos e equipamentos ainda devem ser conferidos nas páginas específicas.</p>`;}
document.getElementById('buildCharacter').addEventListener('click',build); build();
</script>
'''
(root/'crie-personagem.html').write_text(page('Crie seu Personagem','Criação rápida','Escolha raça, variante e classe para gerar uma ficha rápida com os dados básicos do personagem.',crie),encoding='utf-8')

habilidades='''<section><div class="container-narrow reveal">
  <div class="lore-block"><h3>O que são habilidades?</h3><p>Habilidades são técnicas, poderes, magias, manobras especiais e recursos narrativos que definem o que o personagem consegue fazer além das ações básicas. Elas podem causar dano, proteger aliados, controlar o campo de batalha, curar, aplicar efeitos ou modificar a forma como o personagem interage com o mundo.</p><p>Dentro do sistema, as habilidades são separadas pela origem de aquisição e pelo peso narrativo/mecânico que possuem.</p></div>
  <div class="trait-grid">
    <div class="variant-card"><h4>Habilidades Livres</h4><p>São habilidades acessíveis por compra ou progressão aberta. Elas representam técnicas que não pertencem exclusivamente a uma classe, raça ou tradição fechada.</p><div class="variant-ability"><strong>Uso:</strong> boas para personalizar o estilo do personagem.</div></div>
    <div class="variant-card"><h4>Habilidades Exclusivas</h4><p>São ligadas a uma origem específica, como raça, classe, especialização, escola de magia, juramento, orientação divina, origem de feitiçaria ou escola barda.</p><div class="variant-ability"><strong>Uso:</strong> reforçam a identidade principal do personagem.</div></div>
    <div class="variant-card"><h4>Habilidades Perdidas</h4><p>São técnicas raras, antigas ou esquecidas, normalmente associadas a mistérios do mundo, eventos únicos, mestres secretos ou recompensas especiais.</p><div class="variant-ability"><strong>Uso:</strong> devem ter peso narrativo maior e controle do Mestre.</div></div>
  </div>
  <div class="lore-block"><h3>Tipos comuns</h3><p>As habilidades podem funcionar como ataques, testes, conjurações, reações, sustentação, concentração, suporte, controle, defesa ou efeitos passivos. A descrição da habilidade sempre deve indicar alcance, custo, dano ou efeito, teste quando houver, recarga e tipo de ação.</p></div>
</div></section>'''
(root/'habilidades.html').write_text(page('Habilidades','Compêndio','Entenda a função das habilidades e suas divisões principais dentro de Crônicas do Éter.',habilidades),encoding='utf-8')

especial='''<section><div class="container reveal">
  <div class="lore-block"><h3>O que são especializações?</h3><p>Especializações representam o avanço de um personagem que domina mais de um caminho. Elas surgem a partir da combinação entre duas classes compatíveis e servem para consolidar um estilo híbrido, criando uma identidade mais avançada.</p><p>Normalmente, a especialização exige progressão suficiente e domínio das árvores envolvidas. Quando ativada, ela concede bônus de recursos e acesso a uma proposta de jogo própria.</p></div>
  <table class="spec-pair-table"><thead><tr><th>Especialização</th><th>Combinação</th><th>Bônus</th></tr></thead><tbody>
    <tr><td>Algoz</td><td>Bruxo + Paladino</td><td>20 Mana / 20 Energia</td></tr><tr><td>Andarilho</td><td>Arqueiro + Monge</td><td>40 Energia</td></tr><tr><td>Arqueomante</td><td>Arqueiro + Mago</td><td>20 Mana / 20 Energia</td></tr><tr><td>Asceta Sombrio</td><td>Bruxo + Monge</td><td>20 Mana / 20 Energia</td></tr><tr><td>Assassino</td><td>Guerreiro + Ladino</td><td>40 Energia</td></tr><tr><td>Caçador</td><td>Arqueiro + Bárbaro</td><td>40 Energia</td></tr><tr><td>Campeão</td><td>Bardo + Guerreiro</td><td>20 Mana / 20 Energia</td></tr><tr><td>Dobrador</td><td>Feiticeiro + Monge</td><td>20 Mana / 20 Energia</td></tr><tr><td>Executor</td><td>Arqueiro + Ladino</td><td>40 Energia</td></tr><tr><td>Gladiador</td><td>Bárbaro + Guerreiro</td><td>40 Energia</td></tr><tr><td>Gladiador Mágico</td><td>Guerreiro + Mago</td><td>20 Mana / 20 Energia</td></tr><tr><td>Ilusionista</td><td>Bardo + Ladino</td><td>20 Mana / 20 Energia</td></tr><tr><td>Levita</td><td>Bardo + Clérigo</td><td>40 Mana</td></tr><tr><td>Necromante</td><td>Bruxo + Mago</td><td>40 Mana</td></tr><tr><td>Oráculo</td><td>Clérigo + Feiticeiro</td><td>40 Mana</td></tr><tr><td>Sentinela</td><td>Feiticeiro + Paladino</td><td>20 Mana / 20 Energia</td></tr><tr><td>Templário</td><td>Clérigo + Paladino</td><td>20 Mana / 20 Energia</td></tr><tr><td>Xamã</td><td>Bárbaro + Feiticeiro</td><td>20 Mana / 20 Energia</td></tr>
  </tbody></table>
</div></section>'''
(root/'especializacoes.html').write_text(page('Especializações','Classes avançadas','Uma explicação separada sobre como especializações funcionam e quais combinações existem.',especial),encoding='utf-8')

talentos='''<section><div class="container-narrow reveal">
  <div class="lore-block"><h3>O que são talentos?</h3><p>Talentos são aprimoramentos especiais que modificam a forma como o personagem joga. Eles podem fortalecer ações, conceder novas possibilidades, melhorar recursos, abrir estilos de combate ou tornar uma habilidade mais eficiente.</p><p>Diferente das habilidades, que normalmente representam uma ação ou poder específico, talentos funcionam como vantagens permanentes ou técnicas de apoio.</p></div>
  <div class="trait-grid">
    <div class="trait-item"><strong>Livre / Classe</strong><span>Talentos comuns ligados ao desenvolvimento geral ou ao caminho da classe.</span></div>
    <div class="trait-item"><strong>Nível II</strong><span>Versões mais avançadas de talentos, normalmente exigindo pré-requisitos.</span></div>
    <div class="trait-item"><strong>Nível III</strong><span>Estágio superior de um talento, com impacto maior no personagem.</span></div>
    <div class="trait-item"><strong>Incomum</strong><span>Talentos especiais de acesso mais restrito.</span></div>
    <div class="trait-item"><strong>Raro</strong><span>Talentos poderosos, menos frequentes e mais marcantes.</span></div>
    <div class="trait-item"><strong>Lendário</strong><span>Talentos excepcionais, com peso elevado na construção do personagem.</span></div>
  </div>
  <div class="lore-block"><h3>Uso no site</h3><p>A calculadora de XP/PT já considera os custos por categoria. Esta página servirá como compêndio para listar talentos, pré-requisitos e descrições completas futuramente.</p></div>
</div></section>'''
(root/'talentos.html').write_text(page('Talentos','Aprimoramentos','Página de explicação dos talentos e suas categorias dentro do sistema.',talentos),encoding='utf-8')

div='''<section><div class="container-narrow reveal">
  <div class="lore-block" style="text-align:center;"><h3>Página em construção</h3><p>Esta área será dedicada às divindades de Crônicas do Éter.</p><p>Futuramente ela poderá conter panteões, dogmas, domínios, símbolos sagrados, orientações divinas, cultos, igrejas, inimigos religiosos e regras especiais relacionadas à fé.</p></div>
  <div class="rune-divider"><span>✦</span></div>
  <div class="trait-grid">
    <div class="trait-item"><strong>Nome</strong><span>Espaço reservado para o nome da divindade.</span></div>
    <div class="trait-item"><strong>Domínio</strong><span>Luz, lua, morte, guerra, natureza, éter ou outro aspecto.</span></div>
    <div class="trait-item"><strong>Símbolo</strong><span>Representação visual, brasão ou símbolo sagrado.</span></div>
    <div class="trait-item"><strong>Seguidores</strong><span>Cultos, igrejas, paladinos, clérigos e regiões de influência.</span></div>
  </div>
</div></section>'''
(root/'divindades.html').write_text(page('Divindades','Panteão','Página reservada para preencher futuramente as divindades do cenário.',div),encoding='utf-8')

# Add CSS additions if absent
css=root/'styles.css'
cs=css.read_text(encoding='utf-8')
add='''\n/* ── GENERAL TOOLS / FORMS ── */
.creator-layout { display:grid; grid-template-columns: minmax(280px, 380px) 1fr; gap:1.5rem; align-items:start; }
.form-label { display:block; font-family:'Cinzel', serif; font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--rune-bright); margin:1rem 0 .35rem; }
.ether-input { width:100%; background:rgba(6,5,10,.72); border:1px solid var(--border); color:var(--silver-bright); padding:.8rem 1rem; font-family:'Crimson Text', Georgia, serif; font-size:1rem; outline:none; }
.ether-input:focus { border-color:var(--ether-glow); box-shadow:0 0 0 2px rgba(185,143,232,.10); }
.quick-sheet h3 { color:var(--ether-pale); }
.sheet-muted { color:var(--text-dim); font-style:italic; }
@media (max-width: 820px){ .creator-layout { grid-template-columns:1fr; } }
'''
if 'GENERAL TOOLS / FORMS' not in cs:
    cs += add
css.write_text(cs,encoding='utf-8')
