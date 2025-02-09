const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const { createConfig, config } = require('./config');

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

        // Costruisci il transportUrl corretto
        if (finalConfig.DOMAIN) {
            let domain = finalConfig.DOMAIN.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
            let transportUrl = domain;
            
            if (finalConfig.SUBPATH) {
                const subpath = finalConfig.SUBPATH.replace(/^\/|\/$/g, '');
                transportUrl = `${transportUrl}/${subpath}`;
            }
            
            console.log('Transport URL configurato:', transportUrl);
            finalConfig.manifest.transportUrl = transportUrl;
        }

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

        const app = express();

        // Pagina di landing personalizzata
        app.get('/', (req, res) => {
            res.send(`
            <!DOCTYPE html>
            <html style="background: #000">
            <head>
                <meta charset="utf-8">
                <title>${generatedConfig.manifest.name} - Stremio Addon</title>
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
                    form {
                        max-width: 400px;
                        margin: 20px auto;
                        background: #222;
                        padding: 20px;
                        border-radius: 10px;
                    }
                    input, button {
                        width: 100%;
                        margin: 10px 0;
                        padding: 10px;
                        border: none;
                        border-radius: 5px;
                    }
                    input {
                        background: #333;
                        color: #fff;
                    }
                    button {
                        background: #8A5AAB;
                        color: #fff;
                        cursor: pointer;
                    }
                    button:hover {
                        background: #9B6BC3;
                    }
                </style>
            </head>
            <body>
                <img class="logo" src="${generatedConfig.manifest.logo}" alt="Addon Logo" />
                <h1>${generatedConfig.manifest.name}</h1>
                <p>${generatedConfig.manifest.description}</p>
                
                <form id="configForm">
                    <input type="url" id="m3uUrl" placeholder="M3U Playlist URL" value="${generatedConfig.M3U_URL}" required>
                    <input type="url" id="epgUrl" placeholder="EPG URL (optional)" value="${generatedConfig.EPG_URL || ''}">
                    <button type="submit">Configure Addon</button>
                </form>

                <script>
                    document.getElementById('configForm').addEventListener('submit', function(e) {
                        e.preventDefault();
                        const m3uUrl = document.getElementById('m3uUrl').value;
                        const epgUrl = document.getElementById('epgUrl').value;

                        // Costruisci l'URL del manifest con i parametri
                        const params = new URLSearchParams({
                            m3uUrl,
                            ...(epgUrl && {epgUrl})
                        });

                        const manifestUrl = `${window.location.origin}${window.location.pathname}manifest.json?${params.toString()}`;
                        
                        // Apri Stremio con la configurazione personalizzata
                        window.location.href = `stremio://${manifestUrl.replace(/^https?:\/\//i, '')}`;
                    });
                </script>
            </body>
            </html>
            `);
        });

        // Passa l'app Express a serveHTTP
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');
        const addonInterface = builder.getInterface();

        const addonOptions = {
            port: generatedConfig.port,
            expressApp: app  // Passa l'app Express personalizzata
        };

        if (generatedConfig.SUBPATH) {
            addonOptions.path = '/' + generatedConfig.SUBPATH.replace(/^\/|\/$/g, '');
        }

        await serveHTTP(addonInterface, addonOptions);
        
        const baseUrl = generatedConfig.getBaseUrl();
        const manifestUrl = generatedConfig.getManifestUrl();
        
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
