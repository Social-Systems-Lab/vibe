declare namespace Electron {
  interface WebviewTag extends HTMLElement {
    addEventListener(event: string, listener: Function): void;
    removeEventListener(event: string, listener: Function): void;
    src: string;
    nodeintegration: boolean;
    allowpopups: boolean;
    preload: string;
    httpreferrer: string;
    useragent: string;
    disablewebsecurity: boolean;
    partition: string;
    reload(): void;
    loadURL(url: string): void;
    getURL(): string;
    getTitle(): string;
    isLoading(): boolean;
    isWaitingForResponse(): boolean;
    stop(): void;
    goBack(): void;
    goForward(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    clearHistory(): void;
    goToIndex(index: number): void;
    getWebContentsId(): number;
    executeJavaScript(code: string): Promise<any>;
  }

  interface PageTitleUpdatedEvent {
    title: string;
    explicitSet: boolean;
  }

  interface PageFaviconUpdatedEvent {
    favicons: string[];
  }

  interface DidNavigateEvent {
    url: string;
  }
}

declare interface HTMLWebViewElement extends Electron.WebviewTag {}