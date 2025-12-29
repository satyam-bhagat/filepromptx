"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/SidebarProvider.ts
var vscode2 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));

// src/FileScanner.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var FileScanner = class {
  static excludeList = ["node_modules", ".git", "dist", "build", ".next", "package-lock.json"];
  static async getDirectoryStructure(dirPath) {
    const nodes = [];
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
      for (const [name, type] of entries) {
        if (this.excludeList.includes(name) || name.startsWith("."))
          continue;
        const fullPath = path.join(dirPath, name);
        const node = { path: fullPath, name, type };
        if (type === vscode.FileType.Directory) {
          node.children = await this.getDirectoryStructure(fullPath);
        }
        nodes.push(node);
      }
    } catch (e) {
      console.error("Scanner Error:", e);
    }
    return nodes.sort(
      (a, b) => (b.type === vscode.FileType.Directory ? 1 : -1) - (a.type === vscode.FileType.Directory ? 1 : -1) || a.name.localeCompare(b.name)
    );
  }
  static async readSelectedPaths(paths, rootPath) {
    let content = "";
    for (const p of paths) {
      try {
        const data = await vscode.workspace.fs.readFile(vscode.Uri.file(p));
        const text = Buffer.from(data).toString("utf8").trim();
        if (text.length > 0) {
          content += `File: ${path.relative(rootPath, p)}
\`\`\`
${text}
\`\`\`

`;
        }
      } catch (e) {
        continue;
      }
    }
    return content;
  }
  /**
   * Requirement: Save each file with the date it was created and a unique ID.
   * Example: MyPrompt_2025-12-29_123456.md
   */
  static async savePromptToFile(rootPath, filename, content) {
    if (!content || content.includes("--- CONTEXT ---\n\n--- TASK")) {
      throw new Error("EMPTY_CONTENT");
    }
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const uniqueId = Date.now().toString().slice(-6);
    const folderPath = path.join(rootPath, "ai_prompts");
    const cleanName = filename.replace(/\s+/g, "_").replace(/[^\w]/g, "");
    const finalFilename = `${cleanName}_${date}_${uniqueId}.md`;
    const filePath = path.join(folderPath, finalFilename);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(folderPath));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, "utf8"));
    return filePath;
  }
};

// src/SidebarProvider.ts
var SidebarProvider = class {
  constructor(_extensionUri, _context) {
    this._extensionUri = _extensionUri;
    this._context = _context;
  }
  _defaultPrompts = {
    "\u{1F6E0}\uFE0F Resolve Errors": "I am providing code along with error messages or stack traces. Please analyze the issue by understanding the full context of the code and how different parts interact. Identify the root cause of the error and fix it with minimal and safe changes. Respect existing naming conventions, file structure, and design decisions. Do not refactor, rename, or reorganize unless explicitly asked. Show the corrected code completely and briefly explain how to prevent similar issues in the future.",
    "\u{1F4D6} Explain Code": "I am providing code from a project. Please explain it by considering the entire system, not just individual lines. Describe the purpose of the code, the logic flow step by step, and how files, functions, or modules interact. Respect existing naming conventions, structure, and design decisions. Do not suggest refactoring unless explicitly asked.",
    "\u{1F41E} Debug": "I am providing code for debugging. Please audit it as part of a connected system, considering edge cases and real-world usage. Identify logic bugs, edge-case failures, performance issues, or security risks and rank them by severity. Respect existing naming, structure, and design decisions. Do not refactor or reorganize unless explicitly asked, and provide safe, minimal fixes where required.",
    "\u{1F9EA} Test Gen": "I am providing code and want tests generated for it. Treat the project as a single connected system. Generate unit tests for core logic, include edge cases and invalid inputs, and use mocks or stubs for external dependencies when needed. Respect existing naming conventions, file structure, and design decisions. Do not modify production code unless explicitly asked.",
    "\u{1F4E6} Send Full Project": "I am providing multiple files from a project. Please analyze the entire folder structure, cross-file dependencies, and overall architecture as a single connected system. Maintain a clear mental model of how all files interact. Respect existing naming conventions, file structure, and design decisions. Do not refactor, rename, or reorganize unless explicitly asked. When responding, include all relevant files with their full folder structure and ensure all code is shown completely."
  };
  resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
    const updateUI = () => {
      const custom = this._context.globalState.get("customPrompts", {});
      webviewView.webview.html = this._getHtml(custom);
    };
    updateUI();
    webviewView.webview.onDidReceiveMessage(async (data) => {
      const root = vscode2.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!root)
        return;
      switch (data.type) {
        case "ready":
        case "refresh":
          const tree = await FileScanner.getDirectoryStructure(root);
          webviewView.webview.postMessage({ type: "tree", value: tree });
          break;
        case "savePrompt":
          if (!data.paths || data.paths.length === 0) {
            vscode2.window.showErrorMessage("\u274C Selection Guard: Please check a file to save context.");
            return;
          }
          const custom = this._context.globalState.get("customPrompts", {});
          custom[data.name] = data.text;
          await this._context.globalState.update("customPrompts", custom);
          updateUI();
          break;
        case "deletePrompt":
          const p = this._context.globalState.get("customPrompts", {});
          delete p[data.name];
          await this._context.globalState.update("customPrompts", p);
          updateUI();
          break;
        case "copy":
        case "generateFile":
          if (!data.paths || data.paths.length === 0) {
            vscode2.window.showErrorMessage("\u274C No files selected!");
            return;
          }
          const contextStr = await FileScanner.readSelectedPaths(data.paths, root);
          const fullPrompt = `--- CONTEXT ---
${contextStr}

--- TASK: ${data.name} ---
${data.task}`;
          if (data.type === "copy") {
            await vscode2.env.clipboard.writeText(fullPrompt);
            vscode2.window.showInformationMessage("\u26A1 Prompt Copied!");
          } else {
            try {
              const saved = await FileScanner.savePromptToFile(root, data.name, fullPrompt);
              vscode2.window.showInformationMessage(`\u{1F4C4} Saved: ${path2.basename(saved)}`);
            } catch (e) {
              vscode2.window.showErrorMessage("\u274C Error: Selected files were empty.");
            }
          }
          break;
        case "selectModified":
          try {
            const gitApi = vscode2.extensions.getExtension("vscode.git")?.exports.getAPI(1);
            if (!gitApi || !gitApi.repositories[0]) {
              vscode2.window.showErrorMessage("Git repository not found.");
              return;
            }
            const paths = (await gitApi.repositories[0].diffIndexWithHEAD()).map((c) => c.uri.fsPath);
            webviewView.webview.postMessage({ type: "doSelect", paths });
            vscode2.window.showInformationMessage(`\u2705 Git: Selected ${paths.length} modified files.`);
          } catch (e) {
            vscode2.window.showErrorMessage("Git error: Check your terminal.");
          }
          break;
      }
    });
  }
  _getHtml(customPrompts) {
    const all = { ...this._defaultPrompts, ...customPrompts };
    const dropdown = Object.keys(all).map((n) => `<option value="${all[n]}">${n}</option>`).join("");
    const customItems = Object.keys(customPrompts).map((n) => `
            <div class="custom-card">
                <span>${n}</span>
                <button class="inline-del" onclick="onDelete('${n}')">\u{1F5D1}\uFE0F</button>
            </div>
        `).join("");
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
                    <button id="copyBtn" class="btn-main blue">\u26A1 Copy Prompt</button>
                    <button id="fileBtn" class="btn-main green">\u{1F4C4} Save File</button>
                </div>
                <div class="row">
                    <button id="gitBtn" class="git-btn">Git Changes Only</button>
                    <button id="refreshBtn" style="width:32px; background:#222; height:26px; color:#555;">\u21BB</button>
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
                        row.innerHTML = \`<span class="arrow">\${isDir?'\u25B6':''}</span><input type="checkbox" class="node-cb" data-path="\${n.path}">
                        
                        <span style="margin:0 8px">\${isDir?'\u{1F4C1}':'\u{1F4C4}'}</span>
                        

                        
                        
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
};

// src/extension.ts
function activate(context) {
  const provider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode3.window.registerWebviewViewProvider("fileprompt-sidebar-view", provider)
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
