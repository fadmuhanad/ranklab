import { useEffect, useMemo, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { Upload, Film, Type, Palette, Music2, Download, Trash2, GripVertical, Play, Pause, Plus, Scissors, Settings2, Save, X, Sparkles } from 'lucide-react'

const uid=()=>crypto.randomUUID()
const fmt=n=>{n=Number.isFinite(n)?n:0;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`}
const esc=s=>String(s||'').replace(/[^a-z0-9._-]/gi,'_')
const dims=a=>a==='9:16'?[1080,1920]:a==='1:1'?[1080,1080]:[1920,1080]

async function exportMp4(config,onProgress,onStatus){
  const ff=new FFmpeg()
  ff.on('progress',({progress})=>onProgress(Math.min(99,Math.round(progress*100))))
  ff.on('log',({message})=>{if(message.includes('frame=')||message.includes('size='))onStatus('Rendering MP4…')})
  onStatus('Loading MP4 encoder…')
  const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
  const coreURL=await toBlobURL(base+'/ffmpeg-core.js','text/javascript')
  const wasmURL=await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')
  await ff.load({coreURL,wasmURL})
  const {clips,music,musicVolume,aspect,fit,transition,transitionDuration,title,subtitle,showTitle,showRank,showClipName,accent,font,titleSize,rankDirection}=config
  const [w,h]=dims(aspect),durations=clips.map(c=>(c.trimEnd||c.duration)-c.trimStart)
  const safe=clips.map((c,i)=>({ ...c, path:`clip_${i}.mp4` }))
  for(let i=0;i<safe.length;i++){onStatus(`Preparing clip ${i+1} of ${safe.length}…`);await ff.writeFile(safe[i].path,await fetchFile(safe[i].file))}
  const hasAudio=[]
  for(let i=0;i<safe.length;i++){
    let logs='';const handler=({message})=>{logs+=message+'\\n'}
    ff.on('log',handler)
    await ff.exec(['-i',safe[i].path,'-map','0:a:0','-f','null','-'],10000).catch(()=>{})
    ff.off('log',handler)
    hasAudio.push(/Audio:/.test(logs))
  }
  let args=[]
  safe.forEach((c,i)=>args.push('-ss',String(c.trimStart),'-t',String(durations[i]),'-i',c.path))
  const silenceIndex={}
  for(let i=0;i<safe.length;i++)if(!hasAudio[i]){silenceIndex[i]=safe.length+Object.keys(silenceIndex).length;args.push('-f','lavfi','-t',String(durations[i]),'-i','anullsrc=channel_layout=stereo:sample_rate=44100')}
  let musicIndex=-1
  if(music){musicIndex=safe.length+Object.keys(silenceIndex).length;await ff.writeFile('music_track',await fetchFile(music));args.push('-stream_loop','-1','-i','music_track')}
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h)
  ctx.textAlign='center';ctx.textBaseline='top'
  if(showTitle){ctx.fillStyle='#ffffff';ctx.shadowColor='#000000';ctx.shadowBlur=18;ctx.font=`800 ${Math.round(titleSize*w/1080)}px ${font}`;ctx.fillText(title||'',w/2,h*.075,w*.86);ctx.shadowBlur=0;ctx.font=`700 ${Math.round(w*.022)}px ${font}`;ctx.letterSpacing='5px';ctx.fillText(subtitle||'',w/2,h*.075+titleSize*1.15,w*.86)}
  if(showRank){const rank=rankDirection==='top'?1:clips.length;ctx.fillStyle=accent;ctx.fillRect(w*.07,h*.79,w*.2,h*.065);ctx.fillStyle='#111111';ctx.font=`800 ${Math.round(w*.047)}px ${font}`;ctx.textAlign='center';ctx.fillText('#'+rank,w*.17,h*.797)}
  if(showClipName){ctx.fillStyle='#ffffff';ctx.font=`700 ${Math.round(w*.022)}px ${font}`;ctx.fillText(clips[0].name.replace(/\\.[^.]+$/,''),w/2,h*.91,w*.85)}
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await ff.writeFile('overlay.png',await fetchFile(png))
  const overlayIndex=safe.length+Object.keys(silenceIndex).length+(music?1:0)
  args.push('-i','overlay.png')
  const filters=[]
  for(let i=0;i<safe.length;i++){
    const scale=fit==='cover'? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}` : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`
    filters.push(`[${i}:v]${scale},fps=30,setsar=1,format=yuv420p[v${i}]`)
    const ai=hasAudio[i]?i:silenceIndex[i]
    filters.push(`[${ai}:a]atrim=duration=${durations[i]},asetpts=PTS-STARTPTS,aresample=44100,volume=${safe[i].volume??1}[a${i}]`)
  }
  let v='v0',a='a0',elapsed=durations[0]
  for(let i=1;i<safe.length;i++){
    if(transition==='fade'){
      const d=Math.min(transitionDuration,durations[i-1]/2,durations[i]/2)
      const offset=elapsed-d
      filters.push(`[${v}][v${i}]xfade=transition=fade:duration=${d}:offset=${offset}[vx${i}]`)
      filters.push(`[${a}][a${i}]acrossfade=d=${d}:c1=tri:c2=tri[ax${i}]`)
      v='vx'+i;a='ax'+i;elapsed+=durations[i]-d
    }else{
      filters.push(`[${v}][v${i}]concat=n=2:v=1:a=0[vx${i}]`)
      filters.push(`[${a}][a${i}]concat=n=2:v=0:a=1[ax${i}]`)
      v='vx'+i;a='ax'+i;elapsed+=durations[i]
    }
  }
  filters.push(`[${v}][${safe.length===1?overlayIndex:overlayIndex}:v]overlay=0:0:format=auto,format=yuv420p[vout]`)
  if(music){filters.push(`[${musicIndex}:a]volume=${musicVolume},atrim=duration=${elapsed},asetpts=PTS-STARTPTS[bg]`);filters.push(`[${a}][bg]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=0.95[aout]`)}else filters.push(`[${a}]anull[aout]`)
  args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','ranklab-export.mp4')
  onStatus('Rendering MP4…')
  const code=await ff.exec(args)
  if(code!==0)throw new Error('FFmpeg could not render this sequence. Try MP4 (H.264) source files.')
  const data=await ff.readFile('ranklab-export.mp4')
  const url=URL.createObjectURL(new Blob([data.buffer],{type:'video/mp4'}))
  const link=document.createElement('a');link.href=url;link.download=`${esc(config.projectName)||'ranklab'}.mp4`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
  await ff.terminate();onProgress(100)
}

export default function App(){
 const [clips,setClips]=useState([]),[activeId,setActiveId]=useState(null),[tab,setTab]=useState('media')
 const [projectName,setProjectName]=useState('Untitled ranking'),[title,setTitle]=useState('TOP 5'),[subtitle,setSubtitle]=useState('BEST MOMENTS')
 const [showTitle,setShowTitle]=useState(true),[showRank,setShowRank]=useState(true),[showClipName,setShowClipName]=useState(false)
 const [accent,setAccent]=useState('#c7ff4a'),[font,setFont]=useState('Arial'),[titleSize,setTitleSize]=useState(76)
 const [aspect,setAspect]=useState('9:16'),[fit,setFit]=useState('cover'),[rankDirection,setRankDirection]=useState('top')
 const [transition,setTransition]=useState('cut'),[transitionDuration,setTransitionDuration]=useState(.35)
 const [music,setMusic]=useState(null),[musicVolume,setMusicVolume]=useState(.65)
 const [message,setMessage]=useState('Import videos to build your ranking.'),[playing,setPlaying]=useState(false),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0)
 const [muted,setMuted]=useState(true)
 const fileInput=useRef(null),musicInput=useRef(null),video=useRef(null),drag=useRef(null)
 const active=clips.find(c=>c.id===activeId)||clips[0]||null
 const total=useMemo(()=>clips.reduce((n,c)=>n+Math.max(0,(c.trimEnd||c.duration)-c.trimStart),0),[clips])
 useEffect(()=>{if(!activeId&&clips.length)setActiveId(clips[0].id)},[clips,activeId])
 useEffect(()=>{if(video.current){video.current.pause();setPlaying(false);video.current.currentTime=active?.trimStart||0}},[activeId])
 useEffect(()=>()=>{clips.forEach(c=>URL.revokeObjectURL(c.url));if(music?.url)URL.revokeObjectURL(music.url)},[])
 const addVideos=list=>{const files=[...list].filter(f=>f.type.startsWith('video/'));const added=files.map(file=>({id:uid(),file,name:file.name,url:URL.createObjectURL(file),duration:0,trimStart:0,trimEnd:0,volume:1}));setClips(p=>[...p,...added]);if(added.length)setActiveId(p=>p||added[0].id);setMessage(`${added.length} video(s) added.`)}
 const update=(id,patch)=>setClips(p=>p.map(c=>c.id===id?{...c,...patch}:c))
 const remove=id=>{const c=clips.find(x=>x.id===id);if(c)URL.revokeObjectURL(c.url);setClips(p=>p.filter(x=>x.id!==id));if(activeId===id)setActiveId(clips.find(x=>x.id!==id)?.id||null)}
 const move=id=>{if(!drag.current||drag.current===id)return;setClips(p=>{const a=[...p],from=a.findIndex(x=>x.id===drag.current),to=a.findIndex(x=>x.id===id);const [item]=a.splice(from,1);a.splice(to,0,item);return a});drag.current=null}
 const addMusic=file=>{if(!file)return;if(music?.url)URL.revokeObjectURL(music.url);setMusic({file,url:URL.createObjectURL(file),name:file.name})}
 const saveProject=()=>{const data={app:'RANKLAB',version:1,projectName,title,subtitle,showTitle,showRank,showClipName,accent,font,titleSize,aspect,fit,rankDirection,transition,transitionDuration,music:music?.name,clips:clips.map(({name,duration,trimStart,trimEnd,volume})=>({name,duration,trimStart,trimEnd,volume}))};const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='ranklab-project.json';a.click();URL.revokeObjectURL(u)}
 const doExport=async()=>{if(!clips.length||exporting)return;if(clips.some(c=>!c.duration)){setMessage('Wait until all video durations are loaded.');return}setExporting(true);setProgress(0);try{await exportMp4({clips,music:music?.file,musicVolume,aspect,fit,transition,transitionDuration,title,subtitle,showTitle,showRank,showClipName,accent,font,titleSize,rankDirection,projectName},setProgress,setMessage);setMessage('MP4 exported successfully.')}catch(e){console.error(e);setMessage('Export failed: '+e.message)}finally{setExporting(false)}}
 const rank=clips.findIndex(c=>c.id===active?.id)+(rankDirection==='top'?1:clips.length-clips.findIndex(c=>c.id===active?.id))
 return <div className="app">
  <header className="top"><div className="brand"><b>R</b><span>RANK<span className="lime">LAB</span><small>VIDEO RANKING STUDIO</small></span></div><input className="project" value={projectName} onChange={e=>setProjectName(e.target.value)}/><div className="topActions"><button className="ghost" onClick={saveProject}><Save size={16}/> Project</button><button className="export" disabled={!clips.length||exporting} onClick={doExport}><Download size={16}/>{exporting?`Rendering ${progress}%`:'Export MP4'}</button></div></header>
  <main className="layout">
   <aside className="left"><nav>{[['media',Film,'Media'],['text',Type,'Text'],['style',Palette,'Style'],['audio',Music2,'Audio']].map(([id,Icon,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}</nav>
    {tab==='media'&&<section className="pane"><h2>Media library</h2><p>Import and arrange your ranking clips.</p><button className="drop" onClick={()=>fileInput.current.click()}><Upload/><b>Import video clips</b><small>MP4 · MOV · WEBM</small></button><input ref={fileInput} hidden type="file" accept="video/*" multiple onChange={e=>{addVideos(e.target.files);e.target.value=''}}/><div className="subhead">YOUR SEQUENCE <button onClick={()=>fileInput.current.click()}><Plus size={13}/> Add</button></div>{clips.map((c,i)=><div key={c.id} draggable onDragStart={()=>drag.current=c.id} onDragOver={e=>e.preventDefault()} onDrop={()=>move(c.id)} onClick={()=>setActiveId(c.id)} className={'clip '+(active?.id===c.id?'active':'')}><GripVertical size={14}/><b>{String(i+1).padStart(2,'0')}</b><span>{c.name}<small>{c.duration?fmt((c.trimEnd||c.duration)-c.trimStart):'Reading duration…'}</small></span><button onClick={e=>{e.stopPropagation();remove(c.id)}}><Trash2 size={14}/></button><video hidden src={c.url} onLoadedMetadata={e=>update(c.id,{duration:e.currentTarget.duration,trimEnd:c.trimEnd||e.currentTarget.duration})}/></div>)}{!clips.length&&<div className="empty">No clips yet</div>}</section>}
    {tab==='text'&&<section className="pane"><h2>Text overlays</h2><label>MAIN TITLE<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>SUBTITLE<input value={subtitle} onChange={e=>setSubtitle(e.target.value)}/></label>{[['Show title',showTitle,setShowTitle],['Show rank number',showRank,setShowRank],['Show clip name',showClipName,setShowClipName]].map(([s,v,f])=><label className="check" key={s}>{s}<input type="checkbox" checked={v} onChange={e=>f(e.target.checked)}/></label>)}<label>TITLE SIZE · {titleSize}px<input type="range" min="42" max="112" value={titleSize} onChange={e=>setTitleSize(+e.target.value)}/></label></section>}
    {tab==='style'&&<section className="pane"><h2>Visual style</h2><label>ACCENT COLOR<input type="color" value={accent} onChange={e=>setAccent(e.target.value)}/></label><label>FONT FAMILY<select value={font} onChange={e=>setFont(e.target.value)}>{['Arial','Impact','Georgia','Verdana','Trebuchet MS'].map(x=><option>{x}</option>)}</select></label><label>CANVAS RATIO<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label><label>VIDEO FIT<select value={fit} onChange={e=>setFit(e.target.value)}><option value="cover">Fill frame / crop</option><option value="contain">Fit entire video</option></select></label><label>RANK DIRECTION<select value={rankDirection} onChange={e=>setRankDirection(e.target.value)}><option value="top">First clip is #1</option><option value="bottom">Last clip is #1</option></select></label></section>}
    {tab==='audio'&&<section className="pane"><h2>Audio studio</h2><button className="drop" onClick={()=>musicInput.current.click()}><Music2/><b>{music?'Replace soundtrack':'Add background music'}</b><small>MP3 · WAV · M4A</small></button><input ref={musicInput} hidden type="file" accept="audio/*" onChange={e=>addMusic(e.target.files[0])}/>{music&&<div className="music">{music.name}<button onClick={()=>{URL.revokeObjectURL(music.url);setMusic(null)}}><X size={14}/></button></div>}<label>MUSIC VOLUME · {Math.round(musicVolume*100)}%<input type="range" min="0" max="1" step=".01" value={musicVolume} onChange={e=>setMusicVolume(+e.target.value)}/></label><p>Original clip audio is retained and mixed with the soundtrack.</p></section>}
    <div className="privacy">● Media stays on this device</div>
   </aside>
   <section className="center"><div className="stageHead"><span>CANVAS / PREVIEW</span><span>{aspect} · {dims(aspect).join(' × ')}</span></div><div className="stage"><div className={'canvas r'+aspect.replace(':','')} style={{aspectRatio:aspect.replace(':',' / ')}}>{active?<video ref={video} key={active.id} src={active.url} muted={muted} playsInline onLoadedMetadata={e=>{e.currentTarget.currentTime=active.trimStart}} onEnded={()=>setPlaying(false)} onClick={()=>{if(video.current?.paused){video.current.play();setPlaying(true)}else{video.current?.pause();setPlaying(false)}}}/>:<div className="emptyPreview"><Film size={32}/><b>Your video preview</b><span>Import clips to begin</span></div>}<div className="shade"/>{showTitle&&<div className="heading"><b style={{fontSize:`clamp(20px,${titleSize/3}px,48px)`}}>{title}</b><small>{subtitle}</small></div>}{showRank&&active&&<b className="rank" style={{background:accent}}>#{rank}</b>}{showClipName&&active&&<small className="clipName">{active.name}</small>}</div></div><div className="transport"><button onClick={()=>{if(!video.current)return;if(playing){video.current.pause();setPlaying(false)}else{video.current.play();setPlaying(true)}}} disabled={!active}>{playing?<Pause size={16}/>:<Play size={16}/>}</button><span>{active?fmt(video.current?.currentTime||0):'00:00'}</span><span className="duration">{fmt(total)}</span></div><div className="timeline"><div className="subhead">TIMELINE · {clips.length} CLIPS <span>{fmt(total)}</span></div><div className="track">{clips.map((c,i)=><button key={c.id} className={active?.id===c.id?'on':''} onClick={()=>setActiveId(c.id)}><b>{i+1}</b><span>{c.name}</span><small>{fmt((c.trimEnd||c.duration)-c.trimStart)}</small></button>)}</div></div><div className="message">{exporting?'Exporting your video… ':''}{message}</div></section>
   <aside className="right"><h2><Settings2 size={17}/> Inspector</h2>{active?<><p className="filename">{active.name}</p><label>TRIM START · {active.trimStart.toFixed(1)}s<input type="range" min="0" max={Math.max(.1,active.duration)} step=".1" value={active.trimStart} onChange={e=>update(active.id,{trimStart:Math.min(+e.target.value,(active.trimEnd||active.duration)-.1)})}/></label><label>TRIM END · {(active.trimEnd||active.duration).toFixed(1)}s<input type="range" min={Math.min(active.duration,active.trimStart+.1)} max={Math.max(.1,active.duration)} step=".1" value={active.trimEnd||active.duration} onChange={e=>update(active.id,{trimEnd:+e.target.value})}/></label><label>CLIP AUDIO · {Math.round((active.volume??1)*100)}%<input type="range" min="0" max="2" step=".01" value={active.volume??1} onChange={e=>update(active.id,{volume:+e.target.value})}/></label></>:<p>Select a clip to edit it.</p>}<hr/><h3>Sequence settings</h3><label>TRANSITION<select value={transition} onChange={e=>setTransition(e.target.value)}><option value="cut">Hard cut</option><option value="fade">Crossfade</option></select></label><label>CROSSFADE · {transitionDuration.toFixed(2)}s<input type="range" min=".1" max="1.5" step=".05" disabled={transition!=='fade'} value={transitionDuration} onChange={e=>setTransitionDuration(+e.target.value)}/></label><div className="specs"><span>Output<strong>MP4 · H.264</strong></span><span>Frame rate<strong>30 FPS</strong></span><span>Processing<strong>On device</strong></span></div><button className="save" onClick={saveProject}><Save size={14}/> Save project settings</button></aside>
  </main>
  <footer>RANKLAB STUDIO <span>LOCAL WORKSPACE · MP4 EXPORT</span><span>MADE FOR SHORT-FORM VIDEO</span></footer>
 </div>
}
