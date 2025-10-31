// ==UserScript==
// @name         Moodle IPCA Notificador v2.2 (COM LOADER)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Verifica alterações em tópicos/recursos dentro de disciplinas Moodle IPCA
// @author       Comet Assistant
// @match        https://elearning.ipca.pt/*/my/courses.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = "moodle_ipca_alt_disciplinas";
    let loaderModal = null;

    console.log("[MOODLE-IPCA] Script injetado!");

    function criarBotaoFlutuante() {
        if(document.getElementById('moodleipca-checker')) return;
        const botao = document.createElement('button');
        botao.id = 'moodleipca-checker';
        botao.innerText = "Verificar Atualizações";
        botao.style.position = "fixed";
        botao.style.bottom = "40px";
        botao.style.right = "40px";
        botao.style.zIndex = 9999;
        botao.style.padding = "15px 25px";
        botao.style.background = "#0073e6";
        botao.style.color = "white";
        botao.style.borderRadius = "12px";
        botao.style.border = "none";
        botao.style.fontWeight = "bold";
        botao.style.cursor = "pointer";
        botao.style.boxShadow = "0 2px 12px #0005";
        botao.onclick = verificarAlteracoes;
        document.body.appendChild(botao);

        console.log("[MOODLE-IPCA] Botão flutuante criado.");
    }

    function mostrarLoader(total) {
        loaderModal = document.createElement("div");
        loaderModal.id = "moodleipca-loader";
        loaderModal.style = `
            position: fixed;
            bottom: 120px;
            right: 40px;
            min-width: 360px;
            background: linear-gradient(135deg, #0073e6, #005bb3);
            color: white;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.2);
            z-index: 10001;
            padding: 25px;
            font-size: 16px;
            line-height: 1.5;
        `;

        loaderModal.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 18px;">🔍 A verificar disciplinas...</h3>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="
                            background: rgba(255,255,255,0.3);
                            border-radius: 10px;
                            height: 8px;
                            overflow: hidden;
                        ">
                            <div id="moodleipca-progress-bar" style="
                                background: linear-gradient(90deg, #4CAF50, #45a049);
                                height: 100%;
                                width: 0%;
                                transition: width 0.3s ease;
                                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
                            "></div>
                        </div>
                    </div>
                    <span id="moodleipca-progress-text" style="
                        font-weight: bold;
                        min-width: 50px;
                        text-align: right;
                    ">0%</span>
                </div>
                <div style="margin-top: 15px; font-size: 14px; opacity: 0.9;">
                    <span id="moodleipca-progress-counter">0 / ${total}</span> disciplinas
                </div>
            </div>
        `;

        document.body.appendChild(loaderModal);
    }

    function atualizarLoader(current, total) {
        if(!loaderModal) return;

        const percentagem = Math.round((current / total) * 100);
        const progressBar = document.getElementById('moodleipca-progress-bar');
        const progressText = document.getElementById('moodleipca-progress-text');
        const progressCounter = document.getElementById('moodleipca-progress-counter');

        if(progressBar) progressBar.style.width = percentagem + '%';
        if(progressText) progressText.innerText = percentagem + '%';
        if(progressCounter) progressCounter.innerText = `${current} / ${total}`;
    }

    function fecharLoader() {
        if(loaderModal) {
            loaderModal.remove();
            loaderModal = null;
        }
    }

    function obterDisciplinas() {
        const spans = Array.from(document.querySelectorAll('span.multiline[title]'));
        let disciplinas = [];
        spans.forEach(span => {
            const nome = span.getAttribute('title') || span.textContent.trim();
            let link = null;
            let parentA = span.closest('a');
            if(parentA) link = parentA.href;
            if(!link){
                let aIrm = span.parentElement.querySelector('a');
                if(aIrm) link = aIrm.href;
            }
            if(!link){
                let next = span.nextElementSibling;
                while(next){
                    if(next.tagName === "A"){ link = next.href; break;}
                    next = next.nextElementSibling;
                }
            }
            if(nome && link && link.includes('/course/view.php?id=')){
                disciplinas.push({ nome, link });
            }
        });
        console.log("[MOODLE-IPCA] Disciplinas detectadas:", disciplinas);
        return disciplinas;
    }

    async function fetchDisciplinaData(url) {
        try {
            const resposta = await fetch(url, { credentials: 'include' });
            const texto = await resposta.text();
            console.log(`[MOODLE-IPCA] Página carregada: ${url}`);
            const doc = new DOMParser().parseFromString(texto, 'text/html');

            const estrutura = {};

            // Procurar todas as secções (li.section dentro de ul.topics)
            const secoes = doc.querySelectorAll('ul.topics > li.section');

            if(secoes.length === 0) {
                console.warn("[MOODLE-IPCA] Nenhuma secção encontrada!");
                return {};
            }

            secoes.forEach(secao => {
                // Extrair nome do tópico
                let nomeTopico = "Sem nome";
                const tituloEl = secao.querySelector('h3.sectionname');
                if(tituloEl && tituloEl.textContent.trim().length > 0) {
                    nomeTopico = tituloEl.textContent.trim();
                }

                // Inicializar array para este tópico
                if(!estrutura[nomeTopico]) estrutura[nomeTopico] = [];

                // Procurar todas as atividades dentro desta secção
                const atividades = secao.querySelectorAll('li.activity.activity-wrapper');

                atividades.forEach(atividade => {
                    // Identificar tipo pela classe modtype_*
                    let tipo = "Outro";
                    if(atividade.classList.contains('modtype_forum')) tipo = "Fórum";
                    else if(atividade.classList.contains('modtype_resource')) tipo = "Ficheiro";
                    else if(atividade.classList.contains('modtype_assign')) tipo = "Tarefa";
                    else if(atividade.classList.contains('modtype_quiz')) tipo = "Quiz";
                    else if(atividade.classList.contains('modtype_folder')) tipo = "Pasta";
                    else if(atividade.classList.contains('modtype_url')) tipo = "URL";
                    else if(atividade.classList.contains('modtype_page')) tipo = "Página";

                    // Extrair nome e link da atividade
                    const instanceEl = atividade.querySelector('span.instancename');
                    const linkEl = atividade.querySelector('.activityname a');

                    if(instanceEl && linkEl && linkEl.href) {
                        // Limpar o nome (remover texto extra como "Fórum", "Ficheiro", etc)
                        let nomeAtividade = instanceEl.textContent.trim();
                        // Remove badges e texto escondido
                        nomeAtividade = nomeAtividade.replace(/\s+(Fórum|Ficheiro|Tarefa|Quiz|Pasta|URL|Página)\s*$/i, '').trim();
                        const urlAtividade = linkEl.href;

                        // Só adicionar se for válido
                        if(nomeAtividade.length > 0 && !urlAtividade.includes('#collapse')) {
                            estrutura[nomeTopico].push({
                                nome: nomeAtividade,
                                tipo: tipo,
                                url: urlAtividade
                            });
                        }
                    }
                });
            });

            // Remover tópicos vazios
            for(let topico in estrutura) {
                if(estrutura[topico].length === 0) {
                    delete estrutura[topico];
                }
            }

            console.log('[MOODLE-IPCA] Estrutura extraída:', estrutura);
            return estrutura;
        } catch (e) {
            console.error(`[MOODLE-IPCA] Erro ao recolher dados de ${url}:`, e);
            return {};
        }
    }

    function comparaEstruturas(antigo, novo) {
        let diffs = [];
        const todosTopicos = Array.from(new Set([...Object.keys(antigo), ...Object.keys(novo)]));

        for (const topico of todosTopicos) {
            let recAntigos = antigo[topico] || [];
            let recNovos = novo[topico] || [];

            const referenciasAntigos = recAntigos.map(r => `${r.nome}|${r.tipo}|${r.url}`);
            const referenciasNovos = recNovos.map(r => `${r.nome}|${r.tipo}|${r.url}`);

            recNovos.forEach(r => {
                const ref = `${r.nome}|${r.tipo}|${r.url}`;
                if(!referenciasAntigos.includes(ref)){
                    diffs.push({ tipo: "adicionado", topico: topico, recurso: r });
                }
            });

            recAntigos.forEach(r => {
                const ref = `${r.nome}|${r.tipo}|${r.url}`;
                if(!referenciasNovos.includes(ref)){
                    diffs.push({ tipo: "removido", topico: topico, recurso: r });
                }
            });
        }
        return diffs;
    }

    async function verificarAlteracoes() {
        console.log("[MOODLE-IPCA] 🔍 Botão clicado! Iniciar verificação...");
        const discipObjs = obterDisciplinas();

        // Mostrar loader com número total de disciplinas
        mostrarLoader(discipObjs.length);

        let resultados = {};
        let antigos = {};

        if (window.localStorage) {
            antigos = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        }

        let logAlteracoes = {};
        let contador = 0;

        for (let d of discipObjs) {
            let nome = d.nome;
            let url = d.link;
            try {
                console.log(`[MOODLE-IPCA] 📚 A analisar disciplina: ${nome}`);
                let estrutura = await fetchDisciplinaData(url);
                resultados[url] = estrutura;

                let diff = antigos[url] ? comparaEstruturas(antigos[url], estrutura) : null;

                if(diff && diff.length > 0){
                    logAlteracoes[nome] = diff;
                } else if (!antigos[url]) {
                    logAlteracoes[nome] = [{tipo:'primeira', topico:'-', recurso:{nome:'Primeira análise',url:''}}];
                }
            } catch(e) {
                console.error(`[MOODLE-IPCA] ❌ Erro ao processar disciplina "${nome}":`, e);
            }

            // Atualizar loader
            contador++;
            atualizarLoader(contador, discipObjs.length);
        }

        if (window.localStorage) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(resultados));
        }

        // Fechar loader
        fecharLoader();

        if (Object.keys(logAlteracoes).length === 0) {
            mostrarModal("Nenhuma alteração encontrada nas disciplinas!");
            console.log("[MOODLE-IPCA] ✅ Nenhuma alteração encontrada.");
        } else {
            console.log("\n========== 🆕 RESUMO DE NOVIDADES ==========");
            let msgHtml = `<h3 style="margin:0 0 10px 0;">Alterações Detetadas:</h3>`;

            for(const [disc, lista] of Object.entries(logAlteracoes)){
                msgHtml += `<div style="margin-bottom:8px;"><b>${disc}:</b><ul style="padding-left:18px;">`;

                lista.forEach(alt => {
                    if(alt.tipo==='primeira'){
                        msgHtml += `<li><em>Primeira análise — estrutura guardada.</em></li>`;
                        console.log(`📘 ${disc}: Primeira análise`);
                    } else if (alt.tipo === "adicionado") {
                        msgHtml += `<li>[<b>✨ Novo</b>] <i>${alt.topico}</i>: <a href="${alt.recurso.url}" target="_blank">${alt.recurso.nome}</a> (${alt.recurso.tipo})</li>`;
                        console.log(`✨ [NOVO] ${disc} | Tópico: "${alt.topico}" | ${alt.recurso.nome} (${alt.recurso.tipo})\n   🔗 ${alt.recurso.url}`);
                    }
                });
                msgHtml += `</ul></div>`;
            }
            console.log("==========================================\n");
            mostrarModal(msgHtml, true);
        }
    }

    function mostrarModal(mensagem, isHtml){
        let modal = document.createElement("div");
        modal.style = `
            position:fixed; bottom:120px; right:40px; min-width:360px; max-width:500px;
            background:#fff; color:#333; border-radius:12px;
            box-shadow:0 4px 24px rgba(0,0,0,0.15); z-index:10000;
            padding:25px; font-size:16px; line-height:1.5;
            max-height:70vh; overflow-y:auto;
        `;
        if(isHtml) modal.innerHTML = mensagem;
        else modal.textContent = mensagem;

        let fechar = document.createElement("button");
        fechar.innerText = "Fechar";
        fechar.onclick = () => modal.remove();
        fechar.style = "margin-top:15px; float:right; background:#0073e6; color:white; border-radius:8px; border:none; padding: 8px 20px; cursor:pointer; font-weight:bold;";
        modal.appendChild(fechar);
        document.body.appendChild(modal);
    }

    if (/my\/courses\.php/.test(window.location.pathname)) {
        criarBotaoFlutuante();
    }
})();
