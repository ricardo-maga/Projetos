'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Code2, Download, ArrowLeft, CheckCircle2, Server, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function ApiDocsPage() {
  const [activeTab, setActiveTab] = useState<'ui' | 'json' | 'guide'>('ui');
  const [specJson, setSpecJson] = useState<string>('');

  useEffect(() => {
    fetch('/api/v1/openapi.json')
      .then(res => res.json())
      .then(data => setSpecJson(JSON.stringify(data, null, 2)))
      .catch(err => console.error('Error fetching OpenAPI spec:', err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao ERP
          </Link>
          <div className="h-5 w-px bg-slate-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-100 text-base leading-none">Documentação REST API (OpenAPI 3.0)</h1>
              <p className="text-xs text-slate-400 mt-1">Especificação oficial de endpoints e integração com sistemas externos</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab('ui')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'ui'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Interface Interativa
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'json'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Especificação JSON
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Guia de Integração
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* TAB 1: Swagger / Scalar Interactive View */}
        {activeTab === 'ui' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[780px]">
            <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-400 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Base URL: <code className="text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">/api/v1</code>
              </span>
              <a
                href="/api/v1/openapi.json"
                download="openapi.json"
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download openapi.json
              </a>
            </div>
            
            {/* Embedded Redoc/Swagger UI Frame using standard CDN */}
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>ERP OpenAPI Swagger UI</title>
                    <meta charset="utf-8"/>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
                    <style>
                      body { margin: 0; background-color: #0f172a; color: #f8fafc; font-family: sans-serif; }
                      .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
                      .swagger-ui .topbar { display: none; }
                    </style>
                  </head>
                  <body>
                    <div id="swagger-ui"></div>
                    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
                    <script>
                      window.onload = function() {
                        SwaggerUIBundle({
                          url: "/api/v1/openapi.json",
                          dom_id: '#swagger-ui',
                          deepLinking: true,
                          presets: [
                            SwaggerUIBundle.presets.apis,
                            SwaggerUIBundle.SwaggerUIStandalonePreset
                          ],
                        });
                      }
                    </script>
                  </body>
                </html>
              `}
              className="w-full flex-1 border-0"
              title="OpenAPI Swagger Documentation"
            />
          </div>
        )}

        {/* TAB 2: JSON Spec viewer */}
        {activeTab === 'json' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-400" /> Esquema OpenAPI 3.0.3 (JSON)
              </h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(specJson);
                  alert('Especificação OpenAPI copiada para a área de transferência!');
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                Copiar JSON
              </button>
            </div>
            <pre className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto max-h-[650px] leading-relaxed">
              {specJson || 'A carregar especificação...'}
            </pre>
          </div>
        )}

        {/* TAB 3: Integration Guide */}
        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-extrabold text-slate-100 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-400" /> Autenticação & Cabeçalhos
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Todos os pedidos à API RESTful requerem o envio do token de autorização Bearer no cabeçalho <code className="text-emerald-400">Authorization</code> se a sessão estiver ativa.
              </p>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 space-y-2">
                <p className="text-slate-500">{`// Exemplo de cabeçalhos num pedido HTTP:`}</p>
                <p><span className="text-blue-400">Content-Type:</span> application/json</p>
                <p><span className="text-blue-400">Authorization:</span> Bearer &lt;seu_token_jwt&gt;</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-extrabold text-slate-100 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" /> Endpoints Disponíveis
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-900/60 text-blue-300 font-bold font-mono rounded text-[10px]">GET / POST</span>
                  <code>/api/v1/projects</code> - Listar e criar projetos
                </li>
                <li className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-amber-900/60 text-amber-300 font-bold font-mono rounded text-[10px]">PUT / DEL</span>
                  <code>/api/v1/projects/:id</code> - Gerir um projeto
                </li>
                <li className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 font-bold font-mono rounded text-[10px]">GET / POST</span>
                  <code>/api/v1/project-materials</code> - Materiais e encomendas por projeto
                </li>
                <li className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-purple-900/60 text-purple-300 font-bold font-mono rounded text-[10px]">GET / POST</span>
                  <code>/api/v1/tasks</code> - Tarefas técnicas e marcos de projeto
                </li>
              </ul>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
