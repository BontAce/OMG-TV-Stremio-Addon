const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

async function generateConfig() {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(config.M3U_URL);
        console.log(`Trovati ${data.genres.length} generi`);
        console.log('EPG URL configurato:', config.EPG_URL);

        const finalConfig = {
            ...config,
            manifest: {
                ...config.manifest,
                catalogs: [
                    {
                        ...config.manifest.catalogs[0],
                        extra: [
                            {
                                name: 'genre',
                                isRequired: false,
                                options: data.genres
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

        console.log('Configurazione generata con i seguenti generi:');
        console.log(data.genres.join(', '));
        if (config.enableEPG) {
            console.log('EPG abilitata, URL:', config.EPG_URL);
        } else {
            console.log('EPG disabilitata');
        }
        console.log('\n=== Fine Generazione Configurazione ===\n');

        return finalConfig;
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        const generatedConfig = await generateConfig();

        // Aggiornamento transportUrl nel manifest in base al dominio configurato
        const baseUrl = generatedConfig.getBaseUrl();
        const manifestUrl = generatedConfig.getManifestUrl();
        
        // Prepara il transportUrl mantenendo il percorso completo fino a manifest.json
        let transportUrl = baseUrl.replace(/^https?:\/\//i, '');
        if (generatedConfig.SUBPATH) {
            // Assicurati che il subpath sia incluso correttamente
            const subpath = generatedConfig.SUBPATH.replace(/^\/|\/$/g, '');
            transportUrl = `${transportUrl}/${subpath}`;
        }
        // Aggiungi manifest.json
        transportUrl = `${transportUrl}/manifest.json`;
        generatedConfig.manifest.transportUrl = transportUrl;

        const builder = new addonBuilder(generatedConfig.manifest);

        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        const CacheManager = require('./cache-manager')(generatedConfig);

        await CacheManager.updateCache(true).catch(error => {
            console.error('Error updating cache on startup:', error);
        });

        const cachedData = CacheManager.getCachedData();

        const allEpgUrls = [];
        if (generatedConfig.EPG_URL) {
            allEpgUrls.push(generatedConfig.EPG_URL);
        }
        if (cachedData.epgUrls) {
            allEpgUrls.push(...cachedData.epgUrls);
        }

        if (allEpgUrls.length > 0) {
            const combinedEpgUrl = allEpgUrls.join(',');
            await EPGManager.initializeEPG(combinedEpgUrl);
        }

        const landingTemplate = landing => `
<!DOCTYPE html>
<html style="background: #000">
<head>
    <meta charset="utf-8">
    <title>${landing.name} - Stremio Addon</title>
    <style>
        body {
            background: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 { color: #fff; }
        .logo {
            width: 150px;
            margin: 0 auto;
            display: block;
        }
        button {
            border: 0;
            outline: 0;
            color: #fff;
            background: #8A5AAB;
            padding: 13px 30px;
            margin: 20px 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            border-radius: 5px;
        }
        button:hover {
            background: #9B6BC3;
        }
        .footer {
            margin-top: 50px;
            font-size: 14px;
            color: #666;
        }
        .footer a {
            color: #8A5AAB;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
    <script>
        function copyManifestLink() {
            const manifestUrl = window.location.href + 'manifest.json';
            navigator.clipboard.writeText(manifestUrl).then(() => {
                alert('Link del manifest copiato negli appunti!');
            });
        }
    </script>
</head>
<body>
    <img class="logo" src="${landing.logo}" />
    <h1 style="color: white">${landing.name}</h1>
    <h2 style="color: white">${landing.description}</h2>
    <button onclick="window.location = 'stremio://${landing.transportUrl}'">
        Aggiungi a Stremio
    </button>
    <p style="color: white">Link: stremio://${landing.transportUrl}</p>
    <button onclick="copyManifestLink()">
        Copia link manifest
    </button>
</body>
</html>`;

        const addonInterface = builder.getInterface();
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

        // Configura il percorso base per l'addon se è definito un sottopercorso
        const addonOptions = {
            port: generatedConfig.port,
            landingTemplate
        };

        if (generatedConfig.SUBPATH) {
            addonOptions.path = '/' + generatedConfig.SUBPATH.replace(/^\/|\/$/g, '');
        }

        await serveHTTP(addonInterface, addonOptions);
        
        console.log('Addon attivo su:', baseUrl);
        console.log('URL Manifest:', manifestUrl);

        if (generatedConfig.enableEPG) {
            const cachedData = CacheManager.getCachedData();
            EPGManager.checkMissingEPG(cachedData.channels);
        } else {
            console.log('EPG disabilitata, skip inizializzazione');
        }
        
    } catch (error) {
        console.error('Failed to start addon:', error);
        process.exit(1);
    }
}

startAddon();
