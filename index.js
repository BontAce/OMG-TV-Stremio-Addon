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

        // Genera la pagina di installazione
        const generateInstallPage = () => {
            const baseUrl = generatedConfig.getBaseUrl();
            const manifestUrl = generatedConfig.getManifestUrl();
            const fullPath = baseUrl.replace(/^https?:\/\//, '');
            const installUrl = `stremio://${fullPath}/manifest.json`;

            return `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${generatedConfig.manifest.name} - Stremio Addon</title>
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
                        <a href="${installUrl}" class="btn">Installa in Stremio</a>
                        <a href="#" onclick="copyManifestLink()" class="btn">Copia Link Manifest</a>
                    </div>
                    <script>
                        function copyManifestLink() {
                            const manifestUrl = '${manifestUrl}';
                            navigator.clipboard.writeText(manifestUrl).then(() => {
                                alert('Link del manifest copiato!');
                            });
                        }
                    </script>
                </div>
            </body>
            </html>
            `;
        };

        // Costruzione del percorso di mount
        const mountPath = config.SUBPATH 
            ? `/${config.SUBPATH.replace(/^\/|\/$/g, '')}` 
            : '';

        // Gestione reindirizzamenti per SUBPATH
        if (config.SUBPATH) {
            // Reindirizza da / a /subpath/
            app.get('/', (req, res) => {
                res.redirect(301, `${mountPath}/`);
            });

            // Reindirizza da /subpath a /subpath/
            app.get(mountPath, (req, res) => {
                res.redirect(301, `${mountPath}/`);
            });
        }

        // Route principale
        app.get(`${mountPath}/`, (req, res) => {
            res.send(generateInstallPage());
        });

        // Manifest route
        app.get(`${mountPath}/manifest.json`, (req, res) => {
            res.json(addonInterface.manifest);
        });

        // Stream route
        app.get(`${mountPath}/stream/:type/:id`, (req, res) => {
            const { type, id } = req.params;
            streamHandler({ type, id }).then(result => res.json(result));
        });

        // Catalog route
        app.get(`${mountPath}/catalog/:type/:id`, (req, res) => {
            const { type, id } = req.params;
            const { genre, search, skip } = req.query;
            catalogHandler({ type, id, extra: { genre, search, skip } }).then(result => res.json(result));
        });

        // Avvio del server
        const port = config.port || 10000;
        app.listen(port, () => {
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
