const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('quizhunterLibrary',{
 list:()=>ipcRenderer.invoke('library:list'),
 read:id=>ipcRenderer.invoke('library:read',id),
 write:record=>ipcRenderer.invoke('library:write',record),
 remove:id=>ipcRenderer.invoke('library:remove',id),
 onClosing:callback=>{
  const listener=async(_event,token)=>{try{await callback();ipcRenderer.send('library:close-ready',token,true)}catch{ipcRenderer.send('library:close-ready',token,false)}};
  ipcRenderer.on('library:before-close',listener);
  return ()=>ipcRenderer.removeListener('library:before-close',listener);
 },
});
