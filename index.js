const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

// Add base path configuration
const BASE_PATH = process.env.BASE_PATH || '/';

async function generateConfig() {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(config.M3U_URL);
        console.log(`Trovati ${data.genres.length} generi`);
        console.log('EPG URL configurato:', config.EPG_URL);

        // Modify manifest to include base path in endpoints
        const finalConfig = {
            ...config,
            manifest: {
                ...config.manifest,
                // Ensure endpoints use the base path
                endpoint: `${BASE_PATH.replace(/\/$/, '')}/manifest.json`,
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
    <base href="${BASE_PATH}">
</head>
<body>
    <img class="logo" src="${landing.logo}" />
    <h1 style="color: white">${landing.name}</h1>
    <h2 style="color: white">${landing.description}</h2>
    <button onclick="window.location = 'stremio://${landing.transportUrl}/manifest.json'">
        Aggiungi a Stremio
    </button>
</body>
</html>`;

        const addonInterface = builder.getInterface();
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

        await serveHTTP(addonInterface, { 
            port: generatedConfig.port,
            landingTemplate,
            path: BASE_PATH // Add base path to server configuration
        });
        
        const fullUrl = `http://localhost:${generatedConfig.port}${BASE_PATH}`;
        console.log('Addon attivo su:', fullUrl);
        console.log('Aggiungi il seguente URL a Stremio:', `${fullUrl}manifest.json`);

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
