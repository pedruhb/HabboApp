const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const path = require('path');
const configuration = require("./configuration.json");
const dataPath = app.getPath('userData');
const { readFileSync, writeFile, existsSync, unlinkSync } = require('fs');
const axios = require("axios");
var qs = require('qs');
let pluginName;
let mainWindow;

const webservice = axios.create({
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': configuration.app.userAgent },
    httpsAgent: new require('https').Agent({ rejectUnauthorized: false })
})

if (configuration.discord.richPresenceEnabled) {
    const DiscordRPC = require('discord-rpc');
    const clientId = configuration.discord.richPresenceId;
    DiscordRPC.register(clientId);
    const rpc = new DiscordRPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => {
        rpc.request('SET_ACTIVITY', {
            pid: process.pid,
            activity: {
                details: configuration.discord.richPresenceDetails,
                state: configuration.discord.richPresenceState,
                timestamps: {
                    start: Date.now()
                },
                assets: {
                    large_image: configuration.discord.richPresenceLargeImg,
                    small_image: configuration.discord.richPresenceLargeImg,
                    small_text: "Powered by PedroHB#9569 - https://phb.services"
                },
                buttons: [
                    {
                        label: configuration.discord.richButtonTextAccess,
                        url: configuration.url.hotelUrl
                    },
                    {
                        label: configuration.discord.richButtonTextInvite,
                        url: configuration.discord.inviteUrl
                    }
                ]
            }
        });
    });
    rpc.login({ clientId }).catch(console.error);
}

switch (process.platform) {
    case 'win32':
        if (process.arch === "x32" || process.arch === "ia32")
            pluginName = 'win/pepflashplayer-32.dll';
        else
            pluginName = 'win/pepflashplayer.dll';
        break;
    case 'darwin':
        pluginName = 'mac/PepperFlashPlayer.plugin';
        break;
    case "linux":
        if (process.arch === "arm")
            pluginName = 'lin/libpepflashplayer_arm.so';
        else
            pluginName = 'lin/libpepflashplayer_amd.so';
        break;
    case "freebsd":
    case "netbsd":
    case "openbsd":
        pluginName = 'libpepflashplayer.so';
        break;
}

if (process.platform !== "darwin") {
    app.commandLine.appendSwitch('high-dpi-support', "1");
    app.commandLine.appendSwitch('force-device-scale-factor', "1");
}

app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname.includes(".asar") ? process.resourcesPath : __dirname, "flash/" + pluginName));
app.commandLine.appendSwitch('disable-site-isolation-trials');

let createWindow = async () => {
    mainWindow = new BrowserWindow({
        icon: path.join(__dirname, '/icon.png'),
        webPreferences: {
            title: configuration.hotel.hotelName,
            plugins: true,
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webviewTag: true
        },
        show: false,
        frame: true,
        backgroundColor: "#000",
    });
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.setMenu(null);
    mainWindow.on('closed', () => mainWindow = null);
    mainWindow.on('focus', () => mainWindow.flashFrame(false));
    mainWindow.webContents.userAgent = configuration.app.userAgent;

    await mainWindow.loadFile(path.join(__dirname, 'gui', 'index.html'));

    mainWindow.webContents.on('new-window', (e, url) => {
        console.log(url);
        //e.preventDefault();
        // require('electron').shell.openExternal(url);
    });

}

ipcMain.on("openExternalUrl", (e, link) => {
    require('electron').shell.openExternal(link);
});

ipcMain.on("saveLoginData", (e, data) => {
    writeFile(path.join(dataPath, '/logindata.json'), JSON.stringify(data), (e) => {
        if (e) {
            throw e;
        }
    });
});

ipcMain.on("getLoginData", (e) => {
    if (existsSync(path.join(dataPath, '/logindata.json'))) {
        var data = JSON.parse(readFileSync(path.join(dataPath, '/logindata.json'), 'utf8'));
        e.reply("setLoginData", data);
    }
});

ipcMain.on("getConfig", (e) => {
    e.reply("setConfig", configuration);
});

ipcMain.on("logout", (e) => {
    if (existsSync(path.join(dataPath, '/logindata.json'))) {
        unlinkSync(path.join(dataPath, '/logindata.json'), (e) => {
            if (e) {
                throw e;
            }
        });
    }
    mainWindow.webContents.session.clearCache();
    mainWindow.loadFile(path.join(__dirname, 'gui', 'index.html'));
});

ipcMain.on("login", async (e, username, password) => {
    const formData = {
        username: username,
        password: password,
        csrftoken: "",
        remember_me: "false"
    };
    const login = await webservice.post(`${configuration.url.hotelUrl}/auth/login/request`, qs.stringify(formData));
    const cookie = login.headers["set-cookie"][0];
    e.reply("loginCallback", cookie, login.data, login.status);
});

ipcMain.on('clearcache', async () => {
    let session = mainWindow.webContents.session;
    await session.clearCache();
    mainWindow.webContents.session.clearStorageData()
    app.relaunch();
    app.exit();
});

ipcMain.on('fullscreen', () => {
    mainWindow.isFullScreen() ? mainWindow.setFullScreen(false) : mainWindow.setFullScreen(true);
});

ipcMain.on('zoomOut', () => {
    let factor = mainWindow.webContents.getZoomFactor();
    if (factor > 0.3) mainWindow.webContents.setZoomFactor(factor - 0.01);
});

ipcMain.on('zoomIn', () => {
    let factor = mainWindow.webContents.getZoomFactor();
    if (factor < 3) mainWindow.webContents.setZoomFactor(factor + 0.01);
});

ipcMain.on('zoomReset', () => mainWindow.webContents.setZoomFactor(1));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.exit(0);
        app.quit();
    }
});

app.on('before-quit', () => {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
});

app.on('ready', async () => {
    await globalShortcut.register('CommandOrControl+Alt+D', () => { mainWindow.webContents.openDevTools(); });
    await createWindow();
});

app.on('activate', async () => {
    if (mainWindow === null) await createWindow();
});