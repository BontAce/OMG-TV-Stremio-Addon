const fs = require('fs');
const path = require('path');

// Configurazione base predefinita
const baseConfig = {
    port: process.env.PORT || 10000,
    M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist',
    EPG_URL: process.env.EPG_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.epg',
    enableEPG: true,
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
    // Nuove configurazioni per il dominio
    DOMAIN: process.env.DOMAIN || null,
    SUBPATH: process.env.SUBPATH || '',
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

function createConfig(customParams = {}) {
    // Crea una nuova configurazione basata su quella predefinita
    const config = JSON.parse(JSON.stringify(baseConfig));

    // Applica i parametri personalizzati se presenti
    if (customParams.m3uUrl) {
        config.M3U_URL = customParams.m3uUrl;
    }
    if (customParams.epgUrl) {
        config.EPG_URL = customParams.epgUrl;
    }
    if (customParams.enableEpg !== undefined) {
        config.enableEPG = customParams.enableEpg === 'true';
    }
    if (customParams.cacheInterval) {
        config.cacheSettings.updateInterval = parseInt(customParams.cacheInterval);
    }

    // Funzioni helper per la gestione degli URL
    config.getBaseUrl = function() {
        if (this.DOMAIN) {
            const domain = this.DOMAIN.replace(/\/$/, ''); // Rimuove eventuale slash finale
            const subpath = this.SUBPATH ? '/' + this.SUBPATH.replace(/^\/|\/$/g, '') : '';
            return `${domain}${subpath}`;
        }
        return `http://localhost:${this.port}`;
    };

    config.getManifestUrl = function() {
        return `${this.getBaseUrl()}/manifest.json`;
    };

    config.updateEPGUrl = function(url) {
        if (!this.EPG_URL && url) {
            this.EPG_URL = url;
        }
    };

    // Carica configurazioni personalizzate dal file se presente
    try {
        const configOverridePath = path.join(__dirname, 'addon-config.json');
        if (fs.existsSync(configOverridePath)) {
            const customConfig = JSON.parse(fs.readFileSync(configOverridePath, 'utf8'));
            
            // Applica le configurazioni personalizzate dal file
            if (customConfig.addonId) config.manifest.id = customConfig.addonId;
            if (customConfig.addonName) config.manifest.name = customConfig.addonName;
            if (customConfig.addonDescription) config.manifest.description = customConfig.addonDescription;
            if (customConfig.addonVersion) config.manifest.version = customConfig.addonVersion;
            if (customConfig.addonLogo) config.manifest.logo = customConfig.addonLogo;
            
            // Aggiorna il catalogo se necessario
            if (customConfig.addonId || customConfig.addonName) {
                config.manifest.catalogs[0].id = 'omg_plus_tv';
                config.manifest.catalogs[0].name = 'OMG+ TV';
            }
        }
    } catch (error) {
        console.error('Errore nel caricare la configurazione personalizzata:', error);
    }

    return config;
}

// Esporta sia la funzione createConfig che una configurazione predefinita
module.exports = {
    createConfig,
    config: createConfig()
};
