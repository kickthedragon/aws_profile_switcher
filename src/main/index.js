import { app, Tray, Menu, dialog } from 'electron';
import * as _ from 'lodash';
import path from 'path';
import { is } from 'electron-util';
import log from 'electron-log';
import AWS from 'aws-sdk';
import util from 'util';
import { autoUpdater } from 'electron-updater';
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
import { checkForUpdates } from './updater';
const exec = util.promisify(require('child_process').exec);
import commandExists from 'command-exists';
var tray = null;
var credentials = null;
var selectedProfileName = null;
const preAppPath = app.getAppPath().split(path.sep);
if (process.env.NODE_ENV === 'production') {
	const fixPath = require('fix-path');
	fixPath();
}
const iniLoader = new AWS.IniLoader();
global.projectDir = path.resolve(__dirname, '../../');
global.__newStatic = is.development
	? `${__dirname}/../../static`
	: `${preAppPath.slice(0, preAppPath.length - 1).join(path.sep)}${path.sep}static`;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) app.quit();

async function switchProfile(profileName) {
	let switchToProfile = credentials[profileName.label];
	await exec(`aws configure set aws_access_key_id ${switchToProfile.aws_access_key_id}`);
	await exec(`aws configure set aws_secret_access_key ${switchToProfile.aws_secret_access_key}`);
}

async function refreshCredentials() {
	try {
		iniLoader.clearCachedFiles();
		credentials = iniLoader.loadFrom();
	} catch (err) {
		log.error('Credential Load Error', err);
		dialog.showErrorBox(
			'Credential Load Error',
			`${err.toString()}\n\n Fix your credentials file and then hit Refresh Profiles in the tray menu`
		);
	}
	let cMenu = [];
	if (credentials) {
		let credentialsCopy = {};
		for (let credential in credentials) {
			if (credential == 'default') continue;
			credentialsCopy[credential] = credentials[credential];
		}
		selectedProfileName = _.findKey(credentialsCopy, { aws_access_key_id: credentials.default.aws_access_key_id });
		for (let credential in credentialsCopy) {
			if (credential == selectedProfileName)
				cMenu.push({ label: credential, type: 'radio', checked: true, click: switchProfile });
			else cMenu.push({ label: credential, type: 'radio', click: switchProfile });
		}
		cMenu.push({ type: 'separator' });
		cMenu.push({ label: 'Refresh Profiles', type: 'normal', click: refreshCredentials });
		cMenu.push({ label: 'Check for Updates', type: 'normal', click: checkForUpdates });
		if (process.platform == 'darwin') cMenu.push({ label: 'About', type: 'normal', click: app.showAboutPanel });
		cMenu.push({ label: 'Quit', type: 'normal', click: app.quit });
	} else {
		cMenu.push({ label: 'Refresh Profiles', type: 'normal', click: refreshCredentials });
		cMenu.push({ label: 'Check for Updates', type: 'normal', click: checkForUpdates });
		if (process.platform == 'darwin') cMenu.push({ label: 'About', type: 'normal', click: app.showAboutPanel });
		cMenu.push({ label: 'Quit', type: 'normal', click: app.quit });
	}
	const contextMenu = Menu.buildFromTemplate(cMenu);
	tray.setContextMenu(contextMenu);
}

app.on('ready', async () => {
	app.dock.hide();
	try {
		await commandExists('aws');
	} catch (err) {
		dialog.showMessageBox(
			null,
			{
				title: 'awscli must be installed and added to your PATH',
				message: 'awscli must be installed and added to your PATH',
				type: 'error'
			},
			() => {
				app.quit();
			}
		);
		return;
	}
	try {
		switch (process.platform) {
			case 'linux': {
				tray = new Tray(`${__newStatic}/icons/icon.png`);
				break;
			}
			case 'darwin': {
				tray = new Tray(`${__newStatic}/icons/icon-32.png`);
				break;
			}
			case 'win32': {
				tray = new Tray(`${__newStatic}/icons/icon.ico`);
				break;
			}
		}

		tray.setToolTip('AWS Profile Switcher');
	} catch (err) {
		throw new Error(`Error intializing app :${err}`);
	}
	await refreshCredentials();
});
