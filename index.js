const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const config = require('./config');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const path = require('path');

async function generateConfig() {
    const transformer = new PlaylistTransformer();
    const data = await transformer.loadAndTransform(config.M3U_URL);
    
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

    return finalConfig;
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

        // Configurazione Express
        const app = express();
        const addonInterface = builder.getInterface();

        // Funzione per generare la pagina di installazione
        const generateInstallPage = (baseUrl, manifestUrl) => {
            const fullPath = baseUrl.replace(/^https?:\/\//, '');
            const installUrl = `stremio://${fullPath}/manifest.json`;

            return `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${generatedConfig.manifest.name} - Stremio Addon</title>
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        font-family: 'Roboto', sans-serif;
                        background-color: #121212;
                        color: #ffffff;
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        text-align: center;
                    }
                    .container {
                        background-color: #1E1E1E;
                        border-radius: 15px;
                        padding: 40px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                        max-width: 500px;
                        width: 90%;
                    }
                    .logo {
                        max-width: 200px;
                        margin-bottom: 20px;
                        border-radius: 10px;
                    }
                    h1 {
                        color: #BB86FC;
                        margin-bottom: 15px;
                    }
                    .description {
                        color: #B0B0B0;
                        margin-bottom: 30px;
                    }
                    .btn {
                        display: inline-block;
                        background-color: #BB86FC;
                        color: #000;
                        padding: 12px 24px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: bold;
                        transition: all 0.3s ease;
                        margin: 10px;
                    }
                    .btn:hover {
                        background-color: #9661DB;
                        transform: translateY(-3px);
                    }
                    .btn-secondary {
                        background-color: #4A4A4A;
                        color: #ffffff;
                    }
                    .btn-secondary:hover {
                        background-color: #5A5A5A;
                    }
                </style>
                <script>
                    function copyManifestLink() {
                        const manifestUrl = '${manifestUrl}';
                        navigator.clipboard.writeText(manifestUrl).then(() => {
                            alert('Link del manifest copiato negli appunti!');
                        });
                    }
                </script>
            </head>
            <body>
                <div class="container">
                    <img src="${generatedConfig.manifest.logo}" alt="Logo" class="logo">
                    <h1>${generatedConfig.manifest.name}</h1>
                    <p class="description">${generatedConfig.manifest.description}</p>
                    
                    <div class="actions">
                        <a href="${installUrl}" class="btn">Installa in Stremio</a>
                        <a href="#" onclick="copyManifestLink()" class="btn btn-secondary">Copia Link Manifest</a>
                    </div>
                </div>
            </body>
            </html>
            `;
        };

        // Gestione del subpath
        const baseRouter = express.Router();
        
        // Manifest route
        baseRouter.get('/manifest.json', (req, res) => {
            res.json(addonInterface.manifest);
        });

        // Home page route
        baseRouter.get('/', (req, res) => {
            const baseUrl = generatedConfig.getBaseUrl();
            const manifestUrl = generatedConfig.getManifestUrl();
            res.send(generateInstallPage(baseUrl, manifestUrl));
        });

        // Stream route
        baseRouter.get('/stream/:type/:id', (req, res) => {
            const { type, id } = req.params;
            streamHandler({ type, id }).then(result => res.json(result));
        });

        // Catalog route
        baseRouter.get('/catalog/:type/:id', (req, res) => {
            const { type, id } = req.params;
            const { genre, search, skip } = req.query;
            catalogHandler({ type, id, extra: { genre, search, skip } }).then(result => res.json(result));
        });

        // Configurazione finale delle route
        if (generatedConfig.SUBPATH) {
            const subpath = '/' + generatedConfig.SUBPATH.replace(/^\/|\/$/g, '');
            
            // Middleware per rimuovere lo slash finale
            app.use((req, res, next) => {
                if (req.path !== '/' && req.path.endsWith('/')) {
                    const query = req.url.slice(req.path.length);
                    res.redirect(301, req.path.slice(0, -1) + query);
                    return;
                }
                next();
            });

            app.use(subpath, baseRouter);
            
            // Route root che non fa redirect
            app.get('/', (req, res) => {
                res.redirect(subpath);
            });
        } else {
            // Senza subpath, usa le route base
            app.use(baseRouter);
        }

        // Avvio del server
        const server = app.listen(generatedConfig.port, () => {
            const baseUrl = generatedConfig.getBaseUrl();
            const manifestUrl = generatedConfig.getManifestUrl();
            
            console.log('Addon attivo su:', baseUrl);
            console.log('URL Manifest:', manifestUrl);
        });

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
