const {app,BrowserWindow,Menu,shell,dialog,session}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let server,window;
const gotLock=app.requestSingleInstanceLock();
if(!gotLock)app.quit();
else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus()}});
 app.whenReady().then(async()=>{
  const {startStudyServer}=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
  server=await startStudyServer(path.join(__dirname,'..'));
  const isolatedSession=session.fromPartition('quizhunter');
  isolatedSession.setPermissionRequestHandler((contents,permission,callback)=>callback(permission==='clipboard-sanitized-write'&&contents?.getURL().startsWith(server.origin+'/')));
  isolatedSession.setPermissionCheckHandler((_contents,permission,origin)=>permission==='clipboard-sanitized-write'&&origin===server.origin);
  window=new BrowserWindow({width:1320,height:900,minWidth:740,minHeight:600,title:'Quizhunter',backgroundColor:'#f8f9fc',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,session:isolatedSession}});
  const openTrustedLink=url=>{try{const u=new URL(url);if(u.protocol==='https:'&&['platform.openai.com','github.com'].includes(u.hostname))void shell.openExternal(u.href)}catch{}};
  window.webContents.setWindowOpenHandler(({url})=>{openTrustedLink(url);return {action:'deny'}});
  window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==server.origin){event.preventDefault();openTrustedLink(url)}});
  isolatedSession.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'Save study material',defaultPath:path.join(app.getPath('downloads'),item.getFilename())})});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Quizhunter',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
   {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
   {label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
   {role:'windowMenu'}
  ]));
  await window.loadURL(server.origin);window.show();
  window.on('closed',()=>{window=null;app.quit()});
 }).catch(error=>{dialog.showErrorBox('Quizhunter could not start',error.message||'Please reinstall Quizhunter.');app.quit()});
 app.on('before-quit',()=>{if(server){void server.close();server=null}});
 app.on('window-all-closed',()=>app.quit());
}
