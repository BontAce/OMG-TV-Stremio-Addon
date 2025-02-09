const fs = require('fs');
const path = require('path');

const baseConfig = {
    port: process.env.PORT || 10000,
    M3U_URL: 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist',
    EPG_URL: 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.epg',
    enableEPG: true,
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
    DOMAIN: process.env.DOMAIN ? process.env.DOMAIN.replace(/\/$/, '') : null,
    SUBPATH: process.env.SUBPATH ? process.env.SUBPATH.replace(/^\/|\/$/g, '') : '',
    cacheSettings: {
        updateInterval: 12 * 60 * 60 * 1000,
        maxAge: 24 * 60 * 60 * 1000,
        retryAttempts: 3,
        retryDelay: 5000
    },
    epgSettings: {
        maxProgramsPerChannel: 50,
        updateInterval: 12 * 60 * 60 * 1000,
        cacheExpiry: 24 * 60 * 60 * 1000
    },
    manifest: {
        id: 'org.mccoy88f.omgtv',
        version: '3.3.0',
        name: 'OMG TV',
        description: 'Un add-on per Stremio con playlist di canali M3U predefinita, senza personalizzazione.',
        logo: 'https://github.com/mccoy88f/OMG-TV-Stremio-Addon/blob/main/tv.png?raw=true',
        resources: ['stream', 'catalog', 'meta'],
        types: ['tv'],
        idPrefixes: ['tv'],
        catalogs: [
            {
                type: 'tv',
                id: 'omg_tv',
                name: 'OMG TV',
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: []
                    },
                    {
                        name: 'search',
                        isRequired: false
                    },
                    {
                        name: 'skip',
                        isRequired: false
                    }
                ]
            }
        ]
    }
};

function loadCustomConfig() {
    const configOverridePath = path.join(__dirname, 'addon-config.json');

    try {
        if (fs.existsSync(configOverridePath)) {
            const customConfig = JSON.parse(fs.readFileSync(configOverridePath, 'utf8'));
            return {
                ...baseConfig,
                ...customConfig,
                M3U_URL: process.env.M3U_URL || customConfig.M3U_URL || baseConfig.M3U_URL,
                EPG_URL: process.env.EPG_URL || customConfig.EPG_URL || baseConfig.EPG_URL,
                SUBPATH: process.env.SUBPATH || customConfig.SUBPATH || baseConfig.SUBPATH,
                DOMAIN: process.env.DOMAIN || customConfig.DOMAIN || baseConfig.DOMAIN
            };
        }
    } catch (error) {
        console.error('Errore nel caricare la configurazione personalizzata:', error);
    }

    return baseConfig;
}

const config = loadCustomConfig();

config.getBaseUrl = function() {
    const base = this.DOMAIN || `http://localhost:${this.port}`;
    return base + (this.SUBPATH ? `/${this.SUBPATH}` : '');
};

config.getManifestUrl = function() {
    return `${this.getBaseUrl()}/manifest.json`;
};

config.updateEPGUrl = function(url) {
    if (!this.EPG_URL && url) {
        this.EPG_URL = url;
    }
};

module.exports = config;
