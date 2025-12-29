import * as vscode from 'vscode';
import * as path from 'path';
import { FileScanner } from './FileScanner';

export class SidebarProvider implements vscode.WebviewViewProvider {
   private readonly _defaultPrompts: Record<string, string> = {
    "🛠️ Resolve Errors": 
        "I am providing code along with error messages or stack traces. " +
        "Please analyze the issue by understanding the full context of the code and how different parts interact. " +
        "Identify the root cause of the error and fix it with minimal and safe changes. " +
        "Respect existing naming conventions, file structure, and design decisions. " +
        "Do not refactor, rename, or reorganize unless explicitly asked. " +
        "Show the corrected code completely and briefly explain how to prevent similar issues in the future.",

    "📖 Explain Code": 
        "I am providing code from a project. " +
        "Please explain it by considering the entire system, not just individual lines. " +
        "Describe the purpose of the code, the logic flow step by step, and how files, functions, or modules interact. " +
        "Respect existing naming conventions, structure, and design decisions. " +
        "Do not suggest refactoring unless explicitly asked.",

    "🐞 Debug": 
        "I am providing code for debugging. " +
        "Please audit it as part of a connected system, considering edge cases and real-world usage. " +
        "Identify logic bugs, edge-case failures, performance issues, or security risks and rank them by severity. " +
        "Respect existing naming, structure, and design decisions. " +
        "Do not refactor or reorganize unless explicitly asked, and provide safe, minimal fixes where required.",

    "🧪 Test Gen": 
        "I am providing code and want tests generated for it. " +
        "Treat the project as a single connected system. " +
        "Generate unit tests for core logic, include edge cases and invalid inputs, and use mocks or stubs for external dependencies when needed. " +
        "Respect existing naming conventions, file structure, and design decisions. " +
        "Do not modify production code unless explicitly asked.",

    "📦 Send Full Project": 
        "I am providing multiple files from a project. " +
        "Please analyze the entire folder structure, cross-file dependencies, and overall architecture as a single connected system. " +
        "Maintain a clear mental model of how all files interact. " +
        "Respect existing naming conventions, file structure, and design decisions. " +
        "Do not refactor, rename, or reorganize unless explicitly asked. " +
        "When responding, include all relevant files with their full folder structure and ensure all code is shown completely."
};

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };

        const updateUI = () => {
            const custom = this._context.globalState.get<Record<string, string>>('customPrompts', {});
            webviewView.webview.html = this._getHtml(custom);
        };

        updateUI();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!root) return;

            switch (data.type) {
                case 'ready':
                case 'refresh':
                    const tree = await FileScanner.getDirectoryStructure(root);
                    webviewView.webview.postMessage({ type: 'tree', value: tree });
                    break;

                case 'savePrompt':
                    if (!data.paths || data.paths.length === 0) {
                        vscode.window.showErrorMessage("❌ Selection Guard: Please check a file to save context.");
                        return;
                    }
                    const custom = this._context.globalState.get<any>('customPrompts', {});
                    custom[data.name] = data.text;
                    await this._context.globalState.update('customPrompts', custom);
                    updateUI();
                    break;

                case 'deletePrompt':
                    const p = this._context.globalState.get<any>('customPrompts', {});
                    delete p[data.name];
                    await this._context.globalState.update('customPrompts', p);
                    updateUI();
                    break;

                case 'copy':
                case 'generateFile':
                    if (!data.paths || data.paths.length === 0) {
                        vscode.window.showErrorMessage("❌ No files selected!");
                        return;
                    }
                    const contextStr = await FileScanner.readSelectedPaths(data.paths, root);
                    const fullPrompt = `--- CONTEXT ---\n${contextStr}\n\n--- TASK: ${data.name} ---\n${data.task}`;
                    
                    if (data.type === 'copy') {
                        await vscode.env.clipboard.writeText(fullPrompt);
                        vscode.window.showInformationMessage("⚡ Prompt Copied!");
                    } else {
                        try {
                            const saved = await FileScanner.savePromptToFile(root, data.name, fullPrompt);
                            vscode.window.showInformationMessage(`📄 Saved: ${path.basename(saved)}`);
                        } catch (e) {
                            vscode.window.showErrorMessage("❌ Error: Selected files were empty.");
                        }
                    }
                    break;

                case 'selectModified':
                    try {
                        const gitApi = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
                        if (!gitApi || !gitApi.repositories[0]) {
                            vscode.window.showErrorMessage("Git repository not found.");
                            return;
                        }
                        const paths = (await gitApi.repositories[0].diffIndexWithHEAD()).map((c: any) => c.uri.fsPath);
                        // Send paths back to webview to check the boxes
                        webviewView.webview.postMessage({ type: 'doSelect', paths });
                        vscode.window.showInformationMessage(`✅ Git: Selected ${paths.length} modified files.`);
                    } catch (e) { 
                        vscode.window.showErrorMessage("Git error: Check your terminal."); 
                    }
                    break;
            }
        });
    }

    private _getHtml(customPrompts: Record<string, string>) {
        const all = { ...this._defaultPrompts, ...customPrompts };
        const dropdown = Object.keys(all).map(n => `<option value="${all[n]}">${n}</option>`).join('');
        const customItems = Object.keys(customPrompts).map(n => `
            <div class="custom-card">
                <span>${n}</span>
                <button class="inline-del" onclick="onDelete('${n}')">🗑️</button>
            </div>
        `).join('');

        return `<!DOCTYPE html><html><head><style>
            body { padding: 0; margin: 0; font-size: 11px; color: #CCC; background: #0D0D0D; font-family: sans-serif; overflow-x: hidden; }
            .header { padding: 12px; background: #0D0D0D; border-bottom: 1px solid #222; position: sticky; top: 0; z-index: 100; }
            
            /* PILL SEARCH BAR */
            .search-box { display: flex; background: #1A1A1A; border: 1px solid #333; border-radius: 25px; padding: 2px 14px; margin-bottom: 8px; }
            #searchInput { background: transparent; border: none; color: white; width: 100%; height: 26px; outline: none; }
            
            .row { display: flex; gap: 4px; margin-bottom: 6px; }
            select { flex: 1; background: #1A1A1A; color: white; border: 1px solid #333; height: 28px; border-radius: 4px; outline: none; }
            
            /* BUTTON FEEDBACK */
            button { cursor: pointer; border: none; border-radius: 4px; font-weight: 600; transition: all 0.1s ease; }
            button:active { transform: scale(0.96); filter: brightness(1.2); }
            
            .btn-main { flex: 1; height: 32px; color: white; }
            .blue { background: #007ACC; }
            .green { background: #22863a; }
            .btn-icon { background: #333; width: 32px; color: #888; }

            .git-btn { flex: 1; background: #222; color: #888; height: 26px; border: 1px solid #333; font-size: 10px; }
            .git-btn:hover { background: #2d2d2d; color: #fff; border-color: #555; }
            .git-btn:active { background: #007ACC; color: white; border-color: #007ACC; }

            /* MANAGEMENT */
            .mgmt { padding: 8px 12px; background: #0A0A0A; border-bottom: 1px solid #222; }
            .m-title { font-size: 9px; color: #555; text-transform: uppercase; margin-bottom: 5px; }
            .custom-card { display: flex; justify-content: space-between; align-items: center; background: #161616; padding: 5px 8px; border-radius: 4px; margin-bottom: 4px; border: 1px solid #222; }
            .inline-del { background: transparent; color: #555; }

            // /* TREE */
#tree { 
  padding: 14px 18px; 
}



    

            ul { 
  list-style: none; 
  padding-left: 24px; 
  margin: 0; 
}


            // .tree-row { display: flex; align-items: center; height: 22px; cursor: pointer; border-radius: 3px; }



            .tree-row { 
  display: flex; 
  align-items: center; 
  height: 28px; 
  font-size: 12px;
  cursor: pointer; 
  border-radius: 4px; 
}




            .tree-row:hover { background: #1A1A1A; }
            .child-wrap { display: none; margin-left: 8px; border-left: 1px solid #222; }
            .expanded { display: block; }
            .arrow { width: 14px; text-align: center; color: #444; font-size: 8px; }
            .rot { transform: rotate(90deg); }
            input[type="checkbox"] { margin-right: 6px; accent-color: #007ACC; cursor: pointer; }

            .modal { display: none; position: fixed; top: 40px; left: 10px; right: 10px; background: #1C1C1C; border: 1px solid #333; padding: 15px; border-radius: 8px; z-index: 200; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
            textarea { width: 100%; height: 80px; background: #0D0D0D; color: white; border: 1px solid #333; margin-top: 8px; border-radius: 4px; box-sizing: border-box; resize: none; padding: 8px; }
        </style></head>
        <body>
            <div class="header">
                <div class="search-box"><input type="text" id="searchInput" placeholder="Search project files..." autocomplete="off"></div>
                <div class="row">
                    <select id="taskSelect">${dropdown}</select>
                    <button id="addBtn" class="btn-icon">+</button>
                </div>
                <div class="row">
                    <button id="copyBtn" class="btn-main blue">⚡ Copy Prompt</button>
                    <button id="fileBtn" class="btn-main green">📄 Save File</button>
                </div>
                <div class="row">
                    <button id="gitBtn" class="git-btn">Git Changes Only</button>
                    <button id="refreshBtn" style="width:32px; background:#222; height:26px; color:#555;">↻</button>
                </div>
            </div>

            <div class="mgmt">
                <div class="m-title">My Custom Prompts</div>
                <div id="cList">${customItems || '<div style="color:#333">No custom prompts.</div>'}</div>
            </div>

            <div id="modal" class="modal">
                <input type="text" id="mName" placeholder="Prompt Name" style="width:100%; background:#0D0D0D; border:1px solid #333; color:white; padding:5px; box-sizing:border-box; border-radius:4px;">
                <textarea id="mText" placeholder="AI Instructions..."></textarea>
                <div class="row" style="margin-top:10px;"><button id="mSave" class="btn-main blue">Save</button><button id="mClose" style="flex:1; background:#333; color:white;">Cancel</button></div>
            </div>

            <div id="tree"></div>

            <script>
                const vscode = acquireVsCodeApi();
                const treeDiv = document.getElementById('tree');
                vscode.postMessage({type:'ready'});

                const getPaths = () => Array.from(document.querySelectorAll('.node-cb:checked')).map(c=>c.dataset.path);
                const getTask = () => { const s=document.getElementById('taskSelect'); return {task: s.value, name: s.options[s.selectedIndex].text}; };

                document.getElementById('addBtn').onclick = () => document.getElementById('modal').style.display='block';
                document.getElementById('mClose').onclick = () => document.getElementById('modal').style.display='none';
                document.getElementById('mSave').onclick = () => {
                    const name = document.getElementById('mName').value;
                    const text = document.getElementById('mText').value;
                    if(name && text) vscode.postMessage({type:'savePrompt', name, text, paths: getPaths()});
                    document.getElementById('modal').style.display='none';
                };

                const onDelete = (name) => vscode.postMessage({type:'deletePrompt', name});

                document.getElementById('copyBtn').onclick = () => vscode.postMessage({type:'copy', paths: getPaths(), ...getTask()});
                document.getElementById('fileBtn').onclick = () => vscode.postMessage({type:'generateFile', paths: getPaths(), ...getTask()});
                document.getElementById('gitBtn').onclick = () => vscode.postMessage({type:'selectModified'});
                document.getElementById('refreshBtn').onclick = () => vscode.postMessage({type:'refresh'});

            




                document.getElementById('searchInput').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('.tree-row');

    rows.forEach(row => {
        const li = row.parentElement;
        const textMatch = row.innerText.toLowerCase().includes(q);

        li.style.display = textMatch ? 'block' : 'none';

        if (textMatch && q.length > 0) {
            let wrap = li.closest('.child-wrap');
            while (wrap) {
                wrap.classList.add('expanded');
                const parentRow = wrap.previousElementSibling;
                if (parentRow) {
                    parentRow.querySelector('.arrow')?.classList.add('rot');
                    parentRow.parentElement.style.display = 'block';
                }
                wrap = wrap.parentElement.closest('.child-wrap');
            }
        }
    });
};


                window.addEventListener('message', e => {
                    if(e.data.type==='tree') { treeDiv.innerHTML = ''; render(e.data.value, treeDiv); }
                    if(e.data.type==='doSelect') {
                        // Reset all first
                        document.querySelectorAll('.node-cb').forEach(cb => cb.checked = false);
                        // Select new paths
                        document.querySelectorAll('.node-cb').forEach(cb => {
                            if(e.data.paths.includes(cb.dataset.path)) {
                                cb.checked = true;
                                // Expand folders to show the modified files
                                let p = cb.closest('.child-wrap');
                                while(p) {
                                    p.classList.add('expanded');
                                    p.previousElementSibling.querySelector('.arrow').classList.add('rot');
                                    p = p.parentElement.closest('.child-wrap');
                                }
                            }
                        });
                    }
                });

                function render(nodes, target) {
                    const ul = document.createElement('ul');
                    nodes.forEach(n => {
                        const li = document.createElement('li');
                        const isDir = n.type === 2;
                        const row = document.createElement('div');
                        row.className = 'tree-row';
                        row.innerHTML = \`<span class="arrow">\${isDir?'▶':''}</span><input type="checkbox" class="node-cb" data-path="\${n.path}">
                        
                        <span style="margin:0 8px">\${isDir?'📁':'📄'}</span>
                        

                        
                        
                        \${n.name}\`;
                        li.appendChild(row);



                        if(isDir) {
                            const wrap = document.createElement('div');
                            wrap.className = 'child-wrap';
                            render(n.children, wrap);
                            li.appendChild(wrap);
                            row.onclick = (e) => { 
                                if(e.target.type!=='checkbox') { 
                                    wrap.classList.toggle('expanded'); 
                                    row.querySelector('.arrow').classList.toggle('rot'); 
                                } 
                            };
                            row.querySelector('input').onclick = (e) => {
                                wrap.querySelectorAll('input').forEach(c => c.checked = e.target.checked);
                            };
                        }
                        ul.appendChild(li);
                    });
                    target.appendChild(ul);
                }
            </script></body></html>`;
    }
}