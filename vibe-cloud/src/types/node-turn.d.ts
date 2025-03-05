declare module 'node-turn' {
    interface ServerOptions {
        authMech?: 'long-term' | 'short-term';
        credentials?: Record<string, string>;
        realm?: string;
        debugLevel?: 'OFF' | 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'ALL';
        listeningIps?: string[];
        listeningPort?: number;
        relayIps?: string[];
        externalMappedIp?: string;
        maxPort?: number;
        minPort?: number;
        maxAllocateLifetime?: number;
        defaultAllocateLifetime?: number;
        authSecret?: string;
    }

    class Server {
        constructor(options: ServerOptions);
        start(): void;
        stop(): void;
    }

    // The actual export format
    const exports: {
        Server: typeof Server;
    };
    
    export default exports;
}