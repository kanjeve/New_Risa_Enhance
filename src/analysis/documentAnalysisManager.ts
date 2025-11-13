import * as vscode from 'vscode';
import { LanguageService } from '@kanji/pasirser';

/**
 * 開かれているドキュメントごとにLanguageServiceのインスタンスを管理し、
 * 解析処理を一元的に担うクラス。
 */
export class DocumentAnalysisManager {
    private services = new Map<string, LanguageService>();

    /**
     * 指定されたドキュメントに対応するLanguageServiceインスタンスを取得または作成する。
     * @param uri ドキュメントのURI
     * @returns LanguageServiceのインスタンス
     */
    public getService(uri: vscode.Uri): LanguageService {
        const uriString = uri.toString();
        let service = this.services.get(uriString);

        if (!service) {
            service = new LanguageService(uri.fsPath);
            this.services.set(uriString, service);
        }
        return service;
    }

    /**
     * ドキュメントが閉じられた際に、関連するサービスを破棄する。
     * @param uri 閉じられたドキュメントのURI
     */
    public removeService(uri: vscode.Uri): void {
        this.services.delete(uri.toString());
    }

    /**
     * 管理しているすべてのLanguageServiceインスタンスの配列を返す。
     * @returns LanguageServiceのインスタンスの配列
     */
    public getAllServices(): LanguageService[] {
        return Array.from(this.services.values());
    }

    /**
     * 指定されたLanguageServiceインスタンスに対応するURI文字列を返す。
     * @param service 検索対象のLanguageServiceインスタンス
     * @returns URI文字列、見つからなければundefined
     */
    public getUriForService(service: LanguageService): string | undefined {
        for (const [uri, s] of this.services.entries()) {
            if (s === service) {
                return uri;
            }
        }
        return undefined;
    }


    /**
     * すべてのサービスを破棄する。
     */
    public dispose(): void {
        this.services.clear();
    }
}

// シングルトンインスタンスとしてエクスポート
export const analysisManager = new DocumentAnalysisManager();
