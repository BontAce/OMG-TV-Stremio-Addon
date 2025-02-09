const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const config = require('./config');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');

async function generateConfig() {
    const transformer = new PlaylistTransformer();
    const data = await transformer.loadAndTransform(config.M3U_URL);
    
    return {
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
}

async function startAddon() {
    try {
        const generatedConfig = await generateConfig();
        const builder = new addonBuilder(generatedConfig.manifest);

        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        const CacheManager = require('./cache-manager')(generatedConfig);
        await CacheManager.updateCache(true);

        const cachedData = CacheManager.getCachedData();
        const allEpgUrls = [generatedConfig.EPG_URL, ...(cachedData.epgUrls || [])].filter(Boolean);
        
        if (allEpgUrls.length > 0) {
            await EPGManager.initializeEPG(allEpgUrls.join(','));
        }

        const app = express();
        const addonInterface = builder.getInterface();

        // Middleware per gestire il subpath
        app.use((req, res, next) => {
            if (config.SUBPATH) {
                const subpathRegex = new RegExp(`^/${config.SUBPATH}(/|$)`);
                req.url = req.url.replace(subpathRegex, '/');
            }
            next();
        });

        // Generazione pagina installazione
        const generateInstallPage = () => {
            const baseUrl = generatedConfig.getBaseUrl();
            const manifestUrl = `${baseUrl}/manifest.json`;

            return `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${generatedConfig.manifest.name}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        background-color: #121212; 
                        color: white; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        margin: 0; 
                        text-align: center;
                    }
                    .container {
                        background-color: #1E1E1E;
                        padding: 2rem;
                        border-radius: 10px;
                        max-width: 400px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    }
                    .logo {
                        max-width: 150px;
                        margin-bottom: 1rem;
                        border-radius: 10px;
                    }
                    .btn {
                        display: inline-block;
                        background-color: #BB86FC;
                        color: black;
                        padding: 10px 20px;
                        margin: 10px;
                        text-decoration: none;
                        border-radius: 5px;
                        transition: background-color 0.3s ease;
                    }
                    .btn:hover {
                        background-color: #9661DB;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <img src="${generatedConfig.manifest.logo}" alt="Logo" class="logo">
                    <h1>${generatedConfig.manifest.name}</h1>
                    <p>${generatedConfig.manifest.description}</p>
                    <div>
                        <a href="stremio://${baseUrl.replace(/^https?:\/\//, '')}/manifest.json" class="btn">Installa in Stremio</a>
                        <a href="#" onclick="navigator.clipboard.writeText('${manifestUrl}').then(() => alert('Link copiato!'))" class="btn">Copia Link</a>
                    </div>
                </div>
            </body>
            </html>`;
        };

        // Configurazione routes
        app.get('/', (req, res) => res.send(generateInstallPage()));
        app.get('/manifest.json', (req, res) => res.json(addonInterface.manifest));
        app.get('/stream/:type/:id', (req, res) => 
            streamHandler(req.params).then(result => res.json(result)));
        app.get('/catalog/:type/:id', (req, res) => 
            catalogHandler({ ...req.params, extra: req.query }).then(result => res.json(result)));

        // Avvio server
        app.listen(config.port, () => {
            console.log(`Addon attivo su: ${config.getBaseUrl()}`);
            console.log(`Manifest: ${config.getManifestUrl()}`);
        });

        if (generatedConfig.enableEPG) {
            EPGManager.checkMissingEPG(cachedData.channels);
        }

    } catch (error) {
        console.error('Avvio fallito:', error);
        process.exit(1);
    }
}

startAddon();
