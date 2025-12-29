import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    // Pass context to allow the provider to use globalState for persistent storage
    const provider = new SidebarProvider(context.extensionUri, context);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("fileprompt-sidebar-view", provider)
    );
}

export function deactivate() {}