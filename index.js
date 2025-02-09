const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const config = require('./config');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');

async function startAddon() {
    try {
        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(config.M3U_URL);
        
        // Modifica la configurazione per includere i generi
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

        const builder = new addonBuilder(finalConfig.manifest);

        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        const app = express();
        const addonInterface = builder.getInterface();

        // Funzione per generare la pagina di installazione
        const generateInstallPage = () => {
            const baseUrl = config.getBaseUrl();
            const manifestUrl = config.getManifestUrl();
            const fullPath = baseUrl.replace(/^https?:\/\//, '');
            const installUrl = `stremio://${fullPath}/manifest.json`;

            return `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${finalConfig.manifest.name} - Stremio Addon</title>
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
                    }
                    .btn {
                        display: inline-block;
                        background-color: #BB86FC;
                        color: black;
                        padding: 10px 20px;
                        margin: 10px;
                        text-decoration: none;
                        border-radius: 5px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>${finalConfig.manifest.name}</h1>
                    <p>${finalConfig.manifest.description}</p>
                    <div>
                        <a href="${installUrl}" class="btn">Installa in Stremio</a>
                        <a href="#" onclick="copyManifestLink()" class="btn">Copia Link Manifest</a>
                    </div>
                    <script>
                        function copyManifestLink() {
                            navigator.clipboard.writeText('${manifestUrl}').then(() => {
                                alert('Link del manifest copiato!');
                            });
                        }
                    </script>
                </div>
            </body>
            </html>
            `;
        };

        // Configurazione delle route
        const router = express.Router();

        // Manifest route
        router.get('/manifest.json', (req, res) => {
            res.json(addonInterface.manifest);
        });

        // Home page route
        router.get('/', (req, res) => {
            res.send(generateInstallPage());
        });

        // Stream route
        router.get('/stream/:type/:id', (req, res) => {
            const { type, id } = req.params;
            streamHandler({ type, id }).then(result => res.json(result));
        });

        // Catalog route
        router.get('/catalog/:type/:id', (req, res) => {
            const { type, id } = req.params;
            const { genre, search, skip } = req.query;
            catalogHandler({ type, id, extra: { genre, search, skip } }).then(result => res.json(result));
        });

        // Gestione del subpath
        if (config.SUBPATH) {
            const subpath = '/' + config.SUBPATH.replace(/^\/|\/$/g, '');
            app.use(subpath, router);
        } else {
            app.use(router);
        }

        // Avvio del server
        const port = config.port || 10000;
        app.listen(port, () => {
            console.log(`Server attivo su porta ${port}`);
            console.log('URL Manifest:', config.getManifestUrl());
        });

    } catch (error) {
        console.error('Errore avvio addon:', error);
        process.exit(1);
    }
}

startAddon();
