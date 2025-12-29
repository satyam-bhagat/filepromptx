import * as vscode from 'vscode';
import * as path from 'path';

export interface FileTreeNode {
    path: string;
    name: string;
    type: vscode.FileType;
    children?: FileTreeNode[];
}

export class FileScanner {
    private static excludeList = ['node_modules', '.git', 'dist', 'build', '.next', 'package-lock.json'];

    static async getDirectoryStructure(dirPath: string): Promise<FileTreeNode[]> {
        const nodes: FileTreeNode[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
            for (const [name, type] of entries) {
                if (this.excludeList.includes(name) || name.startsWith('.')) continue;
                
                const fullPath = path.join(dirPath, name);
                const node: FileTreeNode = { path: fullPath, name, type };
                
                if (type === vscode.FileType.Directory) {
                    node.children = await this.getDirectoryStructure(fullPath);
                }
                nodes.push(node);
            }
        } catch (e) { console.error("Scanner Error:", e); }
        
        return nodes.sort((a, b) => 
            (b.type === vscode.FileType.Directory ? 1 : -1) - (a.type === vscode.FileType.Directory ? 1 : -1) || 
            a.name.localeCompare(b.name)
        );
    }

    static async readSelectedPaths(paths: string[], rootPath: string): Promise<string> {
        let content = "";
        for (const p of paths) {
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.file(p));
                const text = Buffer.from(data).toString('utf8').trim();
                if (text.length > 0) {
                    content += `File: ${path.relative(rootPath, p)}\n\`\`\`\n${text}\n\`\`\`\n\n`;
                }
            } catch (e) { continue; }
        }
        return content;
    }

    /**
     * Requirement: Save each file with the date it was created and a unique ID.
     * Example: MyPrompt_2025-12-29_123456.md
     */
    static async savePromptToFile(rootPath: string, filename: string, content: string): Promise<string> {
        if (!content || content.includes("--- CONTEXT ---\n\n--- TASK")) {
            throw new Error("EMPTY_CONTENT");
        }

        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const uniqueId = Date.now().toString().slice(-6); // Last 6 digits of timestamp
        const folderPath = path.join(rootPath, 'ai_prompts');
        
        const cleanName = filename.replace(/\s+/g, '_').replace(/[^\w]/g, '');
        const finalFilename = `${cleanName}_${date}_${uniqueId}.md`;
        const filePath = path.join(folderPath, finalFilename);
        
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(folderPath));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
        return filePath;
    }
}