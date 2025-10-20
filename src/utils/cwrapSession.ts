import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { AsirSession } from '@kanji/openxmclient';

export type SessionStatus = 'stopped' | 'starting' | 'active' | 'failed' | 'stopping';

export class CwrapSessionManager {
    private _session: AsirSession | null = null;
    private _masterServer: ChildProcess | null = null;
    private _status: SessionStatus = 'stopped';
    private _statusEventEmitter = new vscode.EventEmitter<SessionStatus>();

    public onDidChangeStatus = this._statusEventEmitter.event;

    constructor(private context: vscode.ExtensionContext, private executorPath: string) {}

    public get session(): AsirSession | null {
        return this._session;
    }

    public get status(): SessionStatus {
        return this._status;
    }

    private setStatus(newStatus: SessionStatus) {
        if (this._status === newStatus) return;
        this._status = newStatus;
        this._statusEventEmitter.fire(this._status);
        console.log(`Session status changed to: ${newStatus}`);
    }

    public async start(): Promise<void> {
        const useSessionMode = vscode.workspace.getConfiguration('risaasirExecutor').get('useSessionMode');
        if (!useSessionMode) {
            console.log('Session mode is disabled. Aborting start.');
            if (this.status !== 'stopped') {
                await this.stop();
            }
            return;
        }

        if (this._status === 'active' || this._status === 'starting') {
            console.log('Session is already active or starting.');
            return;
        }

        this.setStatus('starting');
        const MAX_RETRIES = 3;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                this._masterServer = await this.startMasterServer();
                this.context.subscriptions.push({ dispose: () => this._masterServer?.kill() });

                this._session = new AsirSession();
                await this._session.start(this.executorPath);
                
                console.log(`Session successfully established on attempt ${attempt}.`);
                this.setStatus('active');
                return; 

            } catch (error: any) {
                console.error(`Attempt ${attempt} to start session failed: ${error.message}`);
                await this.stopInternal(); 

                if (attempt === MAX_RETRIES) {
                    vscode.window.showErrorMessage(`Failed to start Asir session after ${MAX_RETRIES} attempts.`);
                    this.setStatus('failed');
                    return;
                }
                await new Promise(res => setTimeout(res, 500));
            }
        }
    }

    public async stop(): Promise<void> {
        this.setStatus('stopping');
        await this.stopInternal();
        this.setStatus('stopped');
    }

    private async stopInternal(): Promise<void> {
        if (this._session) {
            this._session.close();
            this._session = null;
        }
        if (this._masterServer) {
            this._masterServer.kill();
            this._masterServer = null;
        }
    }

    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    public async execute(command: string): Promise<string> {
        if (this._status !== 'active' || !this._session) {
            throw new Error('Asir session is not active. Cannot execute command.');
        }
        // ここで実行中の状態管理を追加することも可能
        try {
            const result = await this._session.execute(command);
            return result;
        } catch (error) {
            // エラーハンドリング
            throw error;
        }
    }

    public interrupt(): void {
        if (this._status === 'active' && this._session) {
            this._session.interrupt();
            vscode.window.showInformationMessage('Sent interrupt signal to Asir session.');
        }
    }

    private startMasterServer(): Promise<ChildProcess> {
        return new Promise<ChildProcess>((resolve, reject) => {
            const serverCommand = 'ox';
            const serverArgs = [ '-ox', 'ox_asir', '-host', '127.0.0.1', '-data', '1300', '-control', '1200', '-insecure' ];
            const serverProcess = spawn(serverCommand, serverArgs);
    
            const timer = setTimeout(() => {
                serverProcess.kill();
                reject(new Error("Asir server startup timed out."));
            }, 10000);
    
            serverProcess.on('error', (err) => { 
                clearTimeout(timer); 
                reject(err); 
            });
            
            serverProcess.on('close', (code) => { 
                if (code !== 0) { 
                    clearTimeout(timer); 
                    reject(new Error(`Master server exited prematurely with code ${code}`)); 
                }
            });
    
            let stderrBuffer = '';
            serverProcess.stderr?.on('data', (data: Buffer) => {
                const messageChunk = data.toString();
                stderrBuffer += messageChunk;
                process.stderr.write(`[Asir Server]: ${messageChunk}`); 
                
                if (stderrBuffer.includes('Port for control message')) {
                    clearTimeout(timer);
                    this.context.subscriptions.push({ dispose: () => serverProcess.kill() });
                    resolve(serverProcess);
                }
            });
        });
    }
}
