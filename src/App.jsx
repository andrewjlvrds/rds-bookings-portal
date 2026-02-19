import React, { useState, useEffect } from 'react'

var API = ''
var ZOHO_ORG = 'https://crm.zoho.com/crm/org6aborc8aa540df51/tab'
var c = {
  bg:'#0c0e14',sf:'#151821',sf2:'#1c2029',sf3:'#242936',
  bd:'#2a2f3d',tx:'#e2e4ed',mu:'#858999',dm:'#555a6e',
  bl:'#4e8cff',bld:'rgba(78,140,255,0.10)',
  gn:'#3dd68c',gnd:'rgba(61,214,140,0.10)',
  or:'#ff8c42',ord:'rgba(255,140,66,0.10)',
  rd:'#ff5c5c',rdd:'rgba(255,92,92,0.10)',
  pu:'#a78bfa',pud:'rgba(167,139,250,0.10)',
  yl:'#fbbf24',yld:'rgba(251,191,36,0.10)',
}
var sm={
  'Confirmed':{bg:c.gnd,fg:c.gn,i:'●'},'Provisional':{bg:c.bld,fg:c.bl,i:'◐'},
  'Enquiry Sent':{bg:c.ord,fg:c.or,i:'○'},'Pending':{bg:c.yld,fg:c.yl,i:'◐'},
  'Cancelled':{bg:c.rdd,fg:c.rd,i:'✕'},'Waitlisted':{bg:c.pud,fg:c.pu,i:'◌'},
  'Deposit Paid':{bg:c.gnd,fg:c.gn,i:'◐'},'Paid in Full':{bg:c.gnd,fg:c.gn,i:'●'},
}
function gs(s){return sm[s]||{bg:c.sf2,fg:c.dm,i:'?'}}
var bf="'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif"
var mf="'JetBrains Mono','SF Mono',monospace"
function fmt(d){if(!d)return'—';var t=new Date(d),m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return t.getDate()+' '+m[t.getMonth()]}
function fmtF(d){if(!d)return'—';var t=new Date(d),m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return t.getDate()+' '+m[t.getMonth()]+' '+t.getFullYear()}
function fmtDT(d){if(!d)return'—';var t=new Date(d),m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],h=t.getHours(),mn=t.getMinutes();return t.getDate()+' '+m[t.getMonth()]+' '+(h<10?'0':'')+h+':'+(mn<10?'0':'')+mn}
function $(a,cu){if(!a)return'—';var n=parseFloat(a);if(isNaN(n))return a;return(cu||'')+' '+n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}

function zohoBookingUrl(id){return ZOHO_ORG+'/CustomModule1/'+id}
function zohoTourUrl(id){return ZOHO_ORG+'/CustomModule3/'+id}

function Badge({status}){var s=gs(status);return React.createElement('span',{style:{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,background:s.bg,color:s.fg,fontFamily:mf,whiteSpace:'nowrap'}},s.i+' '+(status||'—'))}
function Dot({status}){var map={'Available':c.gn,'Confirmed':c.gn,'Provisional':c.yl,'Checking':c.or,'Unavailable':c.rd,'Full':c.rd,'Deposit Paid':c.gn,'Paid in Full':c.gn,'Enquiry Sent':c.or,'Pending':c.yl};return React.createElement('div',{title:status||'?',style:{width:10,height:10,borderRadius:'50%',background:map[status]||c.dm,boxShadow:'0 0 6px '+(map[status]||c.dm)+'60',flexShrink:0}})}
function Spin({t}){return React.createElement('div',{style:{padding:40,textAlign:'center',color:c.mu,fontSize:13}},t||'Loading...')}

function XBtn({onClick,title}){
  return React.createElement('button',{onClick:function(e){e.stopPropagation();onClick()},title:title||'Dismiss',
    style:{background:'none',border:'1px solid '+c.bd,borderRadius:4,color:c.dm,fontSize:12,cursor:'pointer',padding:'2px 6px',lineHeight:1,flexShrink:0,transition:'all 0.15s'},
    onMouseEnter:function(e){e.currentTarget.style.borderColor=c.mu;e.currentTarget.style.color=c.mu},
    onMouseLeave:function(e){e.currentTarget.style.borderColor=c.bd;e.currentTarget.style.color=c.dm}},'✕')
}

function ZohoLink({id,module}){
  var url=module==='tour'?zohoTourUrl(id):zohoBookingUrl(id)
  return React.createElement('a',{href:url,target:'_blank',rel:'noopener',onClick:function(e){e.stopPropagation()},title:'Open in Zoho',
    style:{fontSize:11,color:c.dm,textDecoration:'none',padding:'2px 6px',borderRadius:4,border:'1px solid '+c.bd,flexShrink:0,lineHeight:1,transition:'all 0.15s'},
    onMouseEnter:function(e){e.currentTarget.style.borderColor=c.bl;e.currentTarget.style.color=c.bl},
    onMouseLeave:function(e){e.currentTarget.style.borderColor=c.bd;e.currentTarget.style.color=c.dm}},'↗ Zoho')
}

// ── Dashboard Card ──────────────────────────────────────────────
function DC({title,icon,accent,children}){
  return React.createElement('div',{style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:10,overflow:'hidden',minHeight:160}},
    React.createElement('div',{style:{padding:'12px 16px',borderBottom:'1px solid '+c.bd,fontSize:11,fontWeight:600,color:accent||c.mu,textTransform:'uppercase',letterSpacing:1,display:'flex',alignItems:'center',gap:8}},icon,' ',title),
    React.createElement('div',{style:{padding:'8px 16px 14px'}},children))
}

function PayCard({bookings,showTour}){
  var [dismissed,setDismissed]=useState([])
  var now=new Date().toISOString().split('T')[0],list=[]
  ;(bookings||[]).forEach(function(bk){[['Deposit',bk.Deposit_Due_Date,bk.Deposit_Amount],['2nd',bk.Second_Payment_Due_Date,bk.Second_Payment_Amount],['3rd',bk.Third_Payment_Due_Date,bk.Third_Payment_Amount],['4th',bk.Fourth_Payment_Due_Date,bk.Fourth_Payment_Amount]].forEach(function(d){if(d[1]&&d[2])list.push({lodge:bk.Lodge_Name||bk.Name,tour:bk.tour_name||'',label:d[0],date:d[1],amt:d[2],cur:bk.Lodge_Currency||'',od:d[1]<now,id:bk.id,key:bk.id+'_'+d[0]})})})
  list.sort(function(a,b){return a.date.localeCompare(b.date)})
  var visible=list.filter(function(p){return dismissed.indexOf(p.key)===-1})
  if(!visible.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No upcoming payments')
  return React.createElement('div',null,visible.slice(0,8).map(function(p,i){
    return React.createElement('div',{key:p.key,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<Math.min(visible.length,8)-1?'1px solid '+c.bd:'none',fontSize:12,gap:8}},
      React.createElement('div',{style:{flex:1,minWidth:0,cursor:'pointer'},onClick:function(){window.open(zohoBookingUrl(p.id),'_blank')}},
        React.createElement('div',{style:{fontWeight:500,color:c.tx}},p.lodge),
        React.createElement('div',{style:{color:p.od?c.rd:c.dm,fontSize:11}},(showTour?p.tour+' · ':'')+p.label+' · '+fmtF(p.date)+(p.od?' — OVERDUE':''))),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
        React.createElement('span',{style:{fontFamily:mf,fontSize:12,fontWeight:600,color:p.od?c.rd:c.tx,whiteSpace:'nowrap'}},$(p.amt,p.cur)),
        React.createElement(ZohoLink,{id:p.id}),
        React.createElement(XBtn,{onClick:function(){setDismissed(dismissed.concat([p.key]))},title:'Dismiss'})))
  }))
}

function SnagCard({bookings,showTour}){
  var [dismissed,setDismissed]=useState([])
  var snags=(bookings||[]).filter(function(b){return b.Lodge_Availability==='Unavailable'||b.Lodge_Availability==='Full'||b.Status==='Cancelled'||b.Status==='Waitlisted'||b.Claude_Confidence==='Low'})
  var visible=snags.filter(function(b){return dismissed.indexOf(b.id)===-1})
  if(!visible.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'All bookings looking good ✓')
  return React.createElement('div',null,visible.slice(0,8).map(function(bk,i){
    var r=bk.Lodge_Availability==='Unavailable'||bk.Lodge_Availability==='Full'?'Unavailable':bk.Status==='Cancelled'?'Cancelled':bk.Status==='Waitlisted'?'Waitlisted':'Needs review'
    return React.createElement('div',{key:bk.id,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<visible.length-1?'1px solid '+c.bd:'none',fontSize:12,gap:8}},
      React.createElement('div',{style:{flex:1,minWidth:0,cursor:'pointer'},onClick:function(){window.open(zohoBookingUrl(bk.id),'_blank')}},
        React.createElement('div',{style:{fontWeight:500,color:c.tx}},bk.Lodge_Name||bk.Name),
        React.createElement('div',{style:{color:c.dm,fontSize:11}},(showTour?bk.tour_name+' · ':'')+fmt(bk.Check_in_Date))),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
        React.createElement('span',{style:{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:c.rdd,color:c.rd,fontFamily:mf,whiteSpace:'nowrap'}},r),
        React.createElement(ZohoLink,{id:bk.id}),
        React.createElement(XBtn,{onClick:function(){setDismissed(dismissed.concat([bk.id]))},title:'Dismiss'})))
  }))
}

function ClCard({bookings,showTour}){
  var cut=new Date(Date.now()-48*3600000).toISOString().split('T')[0]
  var rec=(bookings||[]).filter(function(b){return b.Claude_Updated_Time&&b.Claude_Updated_Time>=cut}).sort(function(a,b){return(b.Claude_Updated_Time||'').localeCompare(a.Claude_Updated_Time||'')})
  if(!rec.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No updates in the last 48h')
  return React.createElement('div',null,rec.slice(0,6).map(function(bk,i){var cc=bk.Claude_Confidence;return React.createElement('div',{key:bk.id||i,style:{padding:'6px 0',borderBottom:i<Math.min(rec.length,6)-1?'1px solid '+c.bd:'none',fontSize:12}},
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}},
      React.createElement('span',{style:{fontWeight:500,color:c.tx,flex:1,cursor:'pointer'},onClick:function(){window.open(zohoBookingUrl(bk.id),'_blank')}},bk.Lodge_Name||bk.Name),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
        React.createElement('span',{style:{fontSize:10,padding:'1px 5px',borderRadius:3,fontFamily:mf,background:cc==='High'?c.gnd:cc==='Medium'?c.yld:c.ord,color:cc==='High'?c.gn:cc==='Medium'?c.yl:c.or,fontWeight:600}},cc),
        React.createElement(ZohoLink,{id:bk.id}))),
    React.createElement('div',{style:{fontSize:11,color:c.dm}},(showTour?bk.tour_name+' · ':'')+(bk.Reservation_Comments||'').substring(0,80)))}))
}

function TodoCard({bookings,showTour}){
  var [done,setDone]=useState([])
  var todos=[],now=new Date().toISOString().split('T')[0]
  ;(bookings||[]).forEach(function(bk){
    if(bk.Status==='Enquiry Sent'){
      if(bk.Follow_up_Date&&bk.Follow_up_Date<=now)todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Follow up overdue',p:'high',key:bk.id+'_followup',id:bk.id})
      else todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Awaiting lodge response',p:'medium',key:bk.id+'_await',id:bk.id})
    }
    if(bk.Claude_Confidence==='Low')todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Review Claude extraction',p:'high',key:bk.id+'_claude',id:bk.id})
    if(bk.Status==='Provisional'&&!bk.Deposit_Amount)todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Request proforma / deposit',p:'medium',key:bk.id+'_deposit',id:bk.id})
  })
  todos.sort(function(a,b){return a.p==='high'&&b.p!=='high'?-1:b.p==='high'&&a.p!=='high'?1:0})
  var visible=todos.filter(function(t){return done.indexOf(t.key)===-1})
  if(!visible.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No action items ✓')
  return React.createElement('div',null,visible.slice(0,8).map(function(t,i){
    return React.createElement('div',{key:t.key,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<Math.min(visible.length,8)-1?'1px solid '+c.bd:'none',fontSize:12,gap:8}},
      React.createElement('div',{style:{flex:1,minWidth:0}},
        React.createElement('div',{style:{fontWeight:500,color:c.tx}},t.l),
        React.createElement('div',{style:{color:t.p==='high'?c.rd:c.or,fontSize:11}},(showTour?t.t+' · ':'')+t.task)),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
        React.createElement(ZohoLink,{id:t.id}),
        React.createElement('button',{onClick:function(){setDone(done.concat([t.key]))},title:'Mark done',
          style:{background:'none',border:'1px solid '+c.bd,borderRadius:4,color:c.dm,fontSize:11,cursor:'pointer',padding:'2px 6px',lineHeight:1,flexShrink:0,transition:'all 0.15s'},
          onMouseEnter:function(e){e.currentTarget.style.borderColor=c.gn;e.currentTarget.style.color=c.gn},
          onMouseLeave:function(e){e.currentTarget.style.borderColor=c.bd;e.currentTarget.style.color=c.dm}},'✓ Done')))
  }))
}

// ── Guests Table ────────────────────────────────────────────────
function sv(v){if(v===null||v===undefined)return'';if(typeof v==='object')return v.name||v.id||JSON.stringify(v);return String(v)}
function GuestsView({guests,loading}){
  if(loading)return React.createElement(Spin,{t:'Loading guests...'})
  if(!guests||!guests.length)return React.createElement('div',{style:{padding:30,textAlign:'center',color:c.dm,fontSize:13,background:c.sf,borderRadius:8,border:'1px solid '+c.bd}},'No guest bookings found')
  var hs={fontSize:11,fontWeight:600,padding:'10px 8px',background:c.sf2,borderBottom:'2px solid '+c.bd,color:c.mu,textTransform:'uppercase',letterSpacing:0.5,textAlign:'left',position:'sticky',top:0,whiteSpace:'nowrap'}
  var td={fontSize:12,padding:'10px 8px',borderBottom:'1px solid '+c.bd,verticalAlign:'top',overflow:'hidden',wordWrap:'break-word',overflowWrap:'break-word'}
  var cols=[{h:'Guest',w:200},{h:'Status',w:120},{h:'Nationality',w:90},{h:'Room',w:70},{h:'Bike',w:150},{h:'Dietary/Medical',w:160},{h:'T&Cs',w:44},{h:'Insurance',w:80},{h:'Emergency',w:120}]
  return React.createElement('div',{style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,overflow:'auto',maxHeight:'70vh'}},
    React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',tableLayout:'fixed',minWidth:1100}},
      React.createElement('colgroup',null,cols.map(function(cl,i){return React.createElement('col',{key:i,style:{width:cl.w}})})),
      React.createElement('thead',null,React.createElement('tr',null,
        cols.map(function(cl,i){return React.createElement('th',{key:i,style:hs},cl.h)}))),
      React.createElement('tbody',null,guests.map(function(g,i){
        var tcs=g.tcs_checked===true||g.tcs_checked==='true'||g.tcs_checked==='1'||g.tcs_checked===1
        var hasPillion=g.pillion_name&&g.pillion_name!=='0'&&g.pillion_name!=='false'
        return React.createElement('tr',{key:g.id||i,style:{transition:'background 0.1s'},
          onMouseEnter:function(e){e.currentTarget.style.background=c.sf2},
          onMouseLeave:function(e){e.currentTarget.style.background='transparent'}},
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontWeight:600,color:c.tx}},sv(g.name)),
            React.createElement('div',{style:{fontSize:11,color:c.dm}},sv(g.email)),
            g.phone?React.createElement('div',{style:{fontSize:11,color:c.dm}},sv(g.phone)):null,
            hasPillion?React.createElement('div',{style:{fontSize:11,color:c.pu}},'+ Pillion: '+sv(g.pillion_name)):null
          ),
          React.createElement('td',{style:td},React.createElement(Badge,{status:sv(g.status)})),
          React.createElement('td',{style:td},React.createElement('span',{style:{color:c.tx}},sv(g.nationality)||'—')),
          React.createElement('td',{style:td},
            React.createElement('div',{style:{color:c.tx}},sv(g.room_pref)||'—'),
            g.single_room?React.createElement('div',{style:{fontSize:10,color:c.yl,fontWeight:600}},'SINGLE'):null
          ),
          React.createElement('td',{style:td},
            React.createElement('div',{style:{color:c.tx}},sv(g.bike_pref)||'—'),
            g.own_bike?React.createElement('div',{style:{fontSize:10,color:c.bl}},'Own: '+sv(g.own_bike)):null
          ),
          React.createElement('td',{style:td},
            g.dietary?React.createElement('div',{style:{color:c.or,fontSize:11}},sv(g.dietary)):null,
            g.medical?React.createElement('div',{style:{color:c.rd,fontSize:11}},sv(g.medical)):null,
            !g.dietary&&!g.medical?React.createElement('span',{style:{color:c.dm}},'—'):null
          ),
          React.createElement('td',{style:td},
            React.createElement('div',{style:{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',
              background:tcs?c.gnd:c.rdd,color:tcs?c.gn:c.rd,fontSize:12,fontWeight:700}},
              tcs?'✓':'✗')
          ),
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontSize:11,color:g.insurance1?c.tx:c.dm}},sv(g.insurance1)||'—'),
            g.insurance_details?React.createElement('div',{style:{fontSize:10,color:c.dm}},sv(g.insurance_details).substring(0,40)):null
          ),
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontSize:11,color:g.emergency?c.tx:c.dm}},sv(g.emergency)||'—')
          )
        )
      }))
    )
  )
}

// ── Crew View ───────────────────────────────────────────────────
function CrewView({crew,tourInfo,loading}){
  if(loading)return React.createElement(Spin,{t:'Loading crew...'})

  return React.createElement('div',null,
    tourInfo?React.createElement('div',{style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,padding:16,marginBottom:16}},
      React.createElement('div',{style:{fontSize:11,fontWeight:600,color:c.mu,textTransform:'uppercase',letterSpacing:1,marginBottom:10}},'Tour Room Config'),
      React.createElement('div',{style:{display:'flex',gap:1,background:c.bd,borderRadius:6,overflow:'hidden'}},
        [{l:'Guide Rooms',v:tourInfo.guide_rooms},{l:'Pax Single',v:tourInfo.pax_single},{l:'Pax Twin',v:tourInfo.pax_twin},{l:'Pax Double',v:tourInfo.pax_double},{l:'Max Guests',v:tourInfo.max_guests},{l:'Riders',v:tourInfo.num_riders}].map(function(x,i){
          return React.createElement('div',{key:i,style:{flex:1,background:c.sf2,padding:'10px 14px',textAlign:'center'}},
            React.createElement('div',{style:{fontSize:10,color:c.dm,marginBottom:2}},x.l),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,fontFamily:mf,color:c.tx}},x.v||'—'))
        })
      )
    ):null,

    (!crew||!crew.length)?React.createElement('div',{style:{padding:30,textAlign:'center',color:c.dm,fontSize:13,background:c.sf,borderRadius:8,border:'1px solid '+c.bd}},'No crew assigned to this tour'):
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}},
      crew.map(function(m,i){
        var roleColor=m.role==='Lead Guide'?c.bl:m.role==='Guide 2'?c.gn:m.role==='Driver'?c.or:c.mu
        return React.createElement('div',{key:i,style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,padding:16}},
          React.createElement('div',{style:{fontSize:10,fontWeight:600,color:roleColor,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}},sv(m.role)),
          React.createElement('div',{style:{fontSize:15,fontWeight:600,color:c.tx}},sv(m.name))
        )
      })
    )
  )
}

// ── Tour View (with tabs) ───────────────────────────────────────
function TourView({tour,bookings,allBks,onSelectBooking}){
  var [tourTab,setTourTab]=useState('dashboard')
  var [detail,setDetail]=useState(null)
  var [detLoad,setDetLoad]=useState(false)

  useEffect(function(){
    if(!tour||!tour.id||tour.id==='unassigned')return
    setDetLoad(true)
    fetch(API+'/api/bp-tour-detail?tourId='+tour.id)
      .then(function(r){return r.json()})
      .then(function(d){setDetail(d);setDetLoad(false)})
      .catch(function(){setDetail(null);setDetLoad(false)})
  },[tour?tour.id:null])

  var tabs=[
    {id:'dashboard',l:'Dashboard'},
    {id:'itinerary',l:'Itinerary ('+((bookings||[]).length)+')'},
    {id:'guests',l:'Guests'+(detail?' ('+detail.guest_count+')':'')},
    {id:'crew',l:'Crew'+(detail?' ('+detail.crew_count+')':'')},
  ]

  return React.createElement('div',null,
    React.createElement('h1',{style:{fontSize:20,fontWeight:700,marginBottom:4}},tour.name||'Tour'),
    React.createElement('div',{style:{fontSize:13,color:c.mu,marginBottom:16}},
      (bookings||[]).length+' lodges · '+
      (bookings||[]).filter(function(b){return b.Status==='Confirmed'||b.Status==='Deposit Paid'||b.Status==='Paid in Full'}).length+' confirmed'+
      (detail?' · '+detail.guest_count+' guests':'')),

    React.createElement('div',{style:{display:'flex',gap:2,marginBottom:20,borderBottom:'1px solid '+c.bd}},
      tabs.map(function(t){var a=tourTab===t.id;return React.createElement('button',{key:t.id,onClick:function(){setTourTab(t.id)},
        style:{padding:'10px 18px',border:'none',cursor:'pointer',background:'transparent',fontFamily:bf,fontSize:13,fontWeight:500,color:a?c.bl:c.mu,borderBottom:a?'2px solid '+c.bl:'2px solid transparent',marginBottom:-1}},t.l)})),

    tourTab==='dashboard'?React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}},
      React.createElement(DC,{title:'Upcoming Payments',icon:'💰',accent:c.or},React.createElement(PayCard,{bookings:bookings})),
      React.createElement(DC,{title:'Accommodation Snags',icon:'⚠️',accent:c.rd},React.createElement(SnagCard,{bookings:bookings})),
      React.createElement(DC,{title:'Claude Activity (48h)',icon:'🤖',accent:c.pu},React.createElement(ClCard,{bookings:bookings})),
      React.createElement(DC,{title:'To Do',icon:'📋',accent:c.bl},React.createElement(TodoCard,{bookings:bookings}))
    ):null,

    tourTab==='itinerary'?React.createElement('div',null,
      (bookings||[]).slice().sort(function(a,b){return(a.Check_in_Date||'').localeCompare(b.Check_in_Date||'')}).map(function(bk,i){
        return React.createElement('button',{key:bk.id,onClick:function(){onSelectBooking(bk)},
          style:{display:'flex',width:'100%',textAlign:'left',background:c.sf,border:'1px solid '+c.bd,borderRadius:8,padding:'14px 18px',marginBottom:8,cursor:'pointer',fontFamily:bf,color:c.tx,alignItems:'center',gap:14,transition:'border-color 0.15s'},
          onMouseEnter:function(e){e.currentTarget.style.borderColor=c.bl},
          onMouseLeave:function(e){e.currentTarget.style.borderColor=c.bd}},
          React.createElement('div',{style:{width:44,height:44,borderRadius:8,background:c.sf2,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0}},
            React.createElement('div',{style:{fontSize:10,color:c.dm,lineHeight:1}},fmt(bk.Check_in_Date).split(' ')[1]),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,lineHeight:1.2}},new Date(bk.Check_in_Date).getDate())
          ),
          React.createElement('div',{style:{flex:1,minWidth:0}},
            React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:2}},
              React.createElement(Dot,{status:bk.Lodge_Availability||bk.Status}),
              React.createElement('span',{style:{fontWeight:600,fontSize:14}},bk.Lodge_Name||bk.Name)),
            React.createElement('div',{style:{fontSize:12,color:c.mu}},
              bk.Nights?bk.Nights+'n · ':'',
              bk.Sgl_Twin_Dbl_Guides||[bk.Pax_in_Single_Rooms,bk.Pax_in_Shared_Twin,bk.Pax_in_Shared_Double,bk.Number_of_guides].filter(Boolean).join('/')||'',
              bk.Meals?' · '+bk.Meals:'',
              bk.Km?' · '+bk.Km+'km':''),
            bk.Day_Description?React.createElement('div',{style:{fontSize:11,color:c.dm,marginTop:2,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},bk.Day_Description):null
          ),
          React.createElement('div',{style:{textAlign:'right',flexShrink:0}},
            React.createElement(Badge,{status:bk.Status}),
            bk.Total_Amount?React.createElement('div',{style:{fontSize:12,fontFamily:mf,color:c.mu,marginTop:4}},$(bk.Total_Amount,bk.Lodge_Currency)):null
          )
        )
      })
    ):null,

    tourTab==='guests'?React.createElement(GuestsView,{guests:detail?detail.guests:[],loading:detLoad}):null,
    tourTab==='crew'?React.createElement(CrewView,{crew:detail?detail.crew:[],tourInfo:detail?detail.tour:null,loading:detLoad}):null
  )
}

// ── Lodge Detail ────────────────────────────────────────────────
function LodgeDet({bk,onBack}){
  var [emails,setEmails]=useState([])
  var [eLoad,setELoad]=useState(true)
  var [tab,setTab]=useState('correspondence')
  var [expE,setExpE]=useState(null)
  useEffect(function(){setELoad(true);setExpE(null);setTab('correspondence');fetch(API+'/api/bp-emails?booking_id='+bk.id).then(function(r){return r.json()}).then(function(d){setEmails(d.emails||[]);setELoad(false)}).catch(function(){setEmails([]);setELoad(false)})},[bk.id])
  var tabs=[{id:'correspondence',l:'Correspondence',n:emails.length},{id:'payments',l:'Payments'},{id:'documents',l:'Documents'},{id:'details',l:'Details'}]
  return React.createElement('div',null,
    React.createElement('button',{onClick:onBack,style:{background:'none',border:'none',color:c.bl,fontSize:13,cursor:'pointer',padding:'0 0 12px',fontFamily:bf}},'← Back to itinerary'),
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}},
      React.createElement('div',null,
        React.createElement('h1',{style:{fontSize:20,fontWeight:700,margin:0}},bk.Lodge_Name||bk.Name),
        React.createElement('div',{style:{fontSize:13,color:c.mu,marginTop:2}},fmtF(bk.Check_in_Date)+' → '+fmtF(bk.Check_out_Date)+(bk.Nights?' · '+bk.Nights+'n':'')),
        bk.Day_Description?React.createElement('div',{style:{fontSize:12,color:c.mu,marginTop:4,fontStyle:'italic'}},bk.Day_Description):null),
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        React.createElement(ZohoLink,{id:bk.id}),
        React.createElement(Dot,{status:bk.Lodge_Availability||bk.Status}),
        React.createElement(Badge,{status:bk.Status}))),
    React.createElement('div',{style:{display:'flex',gap:1,background:c.bd,borderRadius:8,overflow:'hidden',marginBottom:16}},
      [{l:'Rooms',v:bk.Sgl_Twin_Dbl_Guides||'—'},{l:'Meals',v:bk.Meals||'—'},{l:'Total',v:$(bk.Total_Amount,bk.Lodge_Currency)},{l:'Km',v:bk.Km||'—'},{l:'Claude',v:bk.Claude_Confidence||'—',b:true}].map(function(x,i){return React.createElement('div',{key:i,style:{flex:1,background:c.sf,padding:'10px 14px',minWidth:0}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:2}},x.l),x.b?React.createElement('span',{style:{fontSize:11,fontWeight:600,fontFamily:mf,color:x.v==='High'?c.gn:x.v==='Medium'?c.yl:x.v==='Low'?c.or:c.dm}},x.v):React.createElement('div',{style:{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},x.v))})),
    React.createElement('div',{style:{display:'flex',gap:2,marginBottom:16,borderBottom:'1px solid '+c.bd}},tabs.map(function(t){var a=tab===t.id;return React.createElement('button',{key:t.id,onClick:function(){setTab(t.id)},style:{padding:'10px 16px',border:'none',cursor:'pointer',background:'transparent',fontFamily:bf,fontSize:13,fontWeight:500,color:a?c.bl:c.mu,borderBottom:a?'2px solid '+c.bl:'2px solid transparent',marginBottom:-1}},t.l+(t.n!==undefined?' ('+t.n+')':''))})),
    tab==='correspondence'?corrTab(emails,eLoad,expE,setExpE):null,
    tab==='payments'?payTab(bk):null,
    tab==='documents'?docTab():null,
    tab==='details'?detTab(bk):null)
}

function corrTab(emails,ld,exp,setExp){
  if(ld)return React.createElement(Spin,{t:'Loading emails...'})
  if(!emails.length)return React.createElement('div',{style:{background:c.sf,borderRadius:8,border:'1px solid '+c.bd,padding:30,textAlign:'center',color:c.dm,fontSize:13}},'No emails captured yet for this booking.')
  return React.createElement('div',null,emails.map(function(e,i){
    var isI=e.direction==='inbound'
    var isE=exp===i
    return React.createElement('div',{key:i,style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,marginBottom:8,borderLeft:'3px solid '+(isI?c.gn:c.bl)}},
      React.createElement('button',{onClick:function(){setExp(isE?null:i)},style:{display:'flex',width:'100%',textAlign:'left',padding:'12px 16px',background:'transparent',border:'none',cursor:'pointer',fontFamily:bf,color:c.tx,justifyContent:'space-between',alignItems:'center'}},
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:13,fontWeight:500}},e.email_subject||'(no subject)'),
          React.createElement('div',{style:{fontSize:11,color:c.dm}},(isI?e.email_from:e.email_to)+' · '+fmtDT(e.email_date)+(e.confidence?' · '+e.confidence:''))),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
          React.createElement('span',{style:{fontSize:10,padding:'2px 6px',borderRadius:3,background:isI?c.gnd:c.bld,color:isI?c.gn:c.bl,fontFamily:mf,fontWeight:600}},isI?'↓ IN':'↑ OUT'),
          React.createElement('span',{style:{fontSize:10,color:c.dm}},isE?'▼':'▶'))),
      isE?React.createElement('div',{style:{padding:'0 16px 14px'}},
        e.summary?React.createElement('div',{style:{marginBottom:10,padding:10,borderRadius:6,background:c.pud,fontSize:12,color:c.pu}},
          React.createElement('div',{style:{fontWeight:600,fontSize:10,marginBottom:4}},'CLAUDE SUMMARY'),
          e.summary):null,
        e.extracted&&Object.values(e.extracted).some(function(v){return v})?
          React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}},
            Object.entries(e.extracted).filter(function(kv){return kv[1]}).map(function(kv,j){
              return React.createElement('span',{key:j,style:{fontSize:11,padding:'2px 8px',borderRadius:4,background:c.sf2,color:c.mu,fontFamily:mf}},kv[0].replace(/_/g,' ')+': '+kv[1])
            })):null,
        e.rate_validation&&e.rate_validation.warnings&&e.rate_validation.warnings.length?
          React.createElement('div',{style:{marginTop:8,padding:8,borderRadius:6,background:c.rdd,fontSize:11,color:c.rd}},'⚠ Rate alert: '+e.rate_validation.warnings.join(', ')):null
      ):null)
  }))
}
function payTab(bk){var pys=[['Deposit',bk.Deposit_Due_Date,bk.Deposit_Amount],['2nd Payment',bk.Second_Payment_Due_Date,bk.Second_Payment_Amount],['3rd Payment',bk.Third_Payment_Due_Date,bk.Third_Payment_Amount],['4th Payment',bk.Fourth_Payment_Due_Date,bk.Fourth_Payment_Amount]].filter(function(p){return p[1]||p[2]});var cur=bk.Lodge_Currency||bk.Currency||'',now=new Date().toISOString().split('T')[0];return React.createElement('div',{style:{background:c.sf,borderRadius:8,border:'1px solid '+c.bd,overflow:'hidden'}},bk.Total_Amount?React.createElement('div',{style:{padding:'14px 18px',borderBottom:'1px solid '+c.bd,display:'flex',justifyContent:'space-between'}},React.createElement('span',{style:{fontSize:13,fontWeight:600}},'Total'),React.createElement('span',{style:{fontSize:16,fontWeight:700,fontFamily:mf}},$(bk.Total_Amount,cur))):null,!pys.length?React.createElement('div',{style:{padding:20,fontSize:12,color:c.dm}},'No payment schedule set'):pys.map(function(p,i){var od=p[1]&&p[1]<now;return React.createElement('div',{key:i,style:{padding:'12px 18px',borderBottom:i<pys.length-1?'1px solid '+c.bd:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}},React.createElement('div',null,React.createElement('div',{style:{fontSize:13,fontWeight:500}},p[0]),p[1]?React.createElement('div',{style:{fontSize:11,color:od?c.rd:c.dm}},'Due: '+fmtF(p[1])+(od?' — OVERDUE':'')):null),React.createElement('span',{style:{fontFamily:mf,fontSize:14,fontWeight:600,color:od?c.rd:c.tx}},$(p[2],cur)))}))}
function docTab(){return React.createElement('div',{style:{background:c.sf,borderRadius:8,border:'1px solid '+c.bd,padding:20}},React.createElement('div',{style:{fontSize:13,color:c.mu}},'Documents from email correspondence will appear here.'),React.createElement('div',{style:{fontSize:12,color:c.dm,marginTop:8}},'STO rates, proformas, and invoices extracted from lodge emails.'))}
function detTab(bk){var fs=[['Status',bk.Status],['Availability',bk.Lodge_Availability],['Check-in',fmtF(bk.Check_in_Date)],['Check-out',fmtF(bk.Check_out_Date)],['Nights',bk.Nights],['Single',bk.Pax_in_Single_Rooms||bk.Single_Rooms],['Shared Dbl',bk.Pax_in_Shared_Double||bk.Shared_Double_Rooms],['Shared Twn',bk.Pax_in_Shared_Twin||bk.Shared_Twin_Rooms],['Guides',bk.Number_of_guides||bk.Guide_Rooms],['Config',bk.Sgl_Twin_Dbl_Guides],['Meals',bk.Meals],['Total',$(bk.Total_Amount,bk.Lodge_Currency)],['Deposit',$(bk.Deposit_Amount,bk.Lodge_Currency)],['Rate',bk.Exchange_Rate],['Ref',bk.Booking_Reference],['Contact',bk.Contact_Name],['Email',bk.Email],['Follow-up',fmtF(bk.Follow_up_Date)],['Km',bk.Km],['Excursion',bk.Excursion],['Exc Status',bk.Excursion_booking_status],['Claude',bk.Claude_Confidence],['Claude Date',fmtF(bk.Claude_Updated_Time)]].filter(function(f){return f[1]&&f[1]!=='—'});return React.createElement('div',null,React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1,background:c.bd,borderRadius:8,overflow:'hidden'}},fs.map(function(f,i){return React.createElement('div',{key:i,style:{background:c.sf,padding:'10px 14px'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:2}},f[0]),React.createElement('div',{style:{fontSize:13,fontWeight:500}},f[1]))}),bk.Reservation_Comments?React.createElement('div',{style:{background:c.sf,padding:'10px 14px',gridColumn:'1/-1'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}},'Reservation Comments'),React.createElement('div',{style:{fontSize:12,color:c.mu,whiteSpace:'pre-wrap',lineHeight:1.5}},bk.Reservation_Comments)):null,bk.Booking_Notes?React.createElement('div',{style:{background:c.sf,padding:'10px 14px',gridColumn:'1/-1'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}},'Booking Notes'),React.createElement('div',{style:{fontSize:12,color:c.mu,whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:200,overflow:'auto'}},bk.Booking_Notes)):null))}

// ── Tour grouping helper ────────────────────────────────────────
function groupTours(tours){
  var now=new Date()
  var today=now.toISOString().split('T')[0]
  var upcoming=[],tours2027=[],completed=[]

  tours.forEach(function(tour){
    if(tour.id==='unassigned'){upcoming.push(tour);return}

    // Check name for year hint (e.g. "FoSA Apr 27" or "EoA Jan 27")
    var nameHas27=/ 27$|27 |2027/.test(tour.name||'')

    var lastDate=''
    ;(tour.bookings||[]).forEach(function(bk){
      if(bk.Check_out_Date&&bk.Check_out_Date>lastDate)lastDate=bk.Check_out_Date
      if(bk.Check_in_Date&&bk.Check_in_Date>lastDate&&!bk.Check_out_Date)lastDate=bk.Check_in_Date
    })
    if(tour.end_date&&tour.end_date>lastDate)lastDate=tour.end_date
    if(tour.departure_date&&tour.departure_date>lastDate)lastDate=tour.departure_date

    // Name-based override: if name contains 27/2027, put in 2027
    if(nameHas27){tours2027.push(tour);return}

    if(!lastDate){upcoming.push(tour);return}

    var year=lastDate.substring(0,4)
    if(year>='2027'){
      tours2027.push(tour)
    } else if(lastDate<today){
      completed.push(tour)
    } else {
      upcoming.push(tour)
    }
  })

  upcoming.sort(function(a,b){
    var aD=(a.bookings&&a.bookings[0])?a.bookings[0].Check_in_Date||'':'';
    var bD=(b.bookings&&b.bookings[0])?b.bookings[0].Check_in_Date||'':'';
    return aD.localeCompare(bD)
  })
  tours2027.sort(function(a,b){
    var aD=(a.bookings&&a.bookings[0])?a.bookings[0].Check_in_Date||'':'';
    var bD=(b.bookings&&b.bookings[0])?b.bookings[0].Check_in_Date||'':'';
    return aD.localeCompare(bD)
  })
  completed.sort(function(a,b){
    var aD=(a.bookings&&a.bookings[0])?a.bookings[0].Check_in_Date||'':'';
    var bD=(b.bookings&&b.bookings[0])?b.bookings[0].Check_in_Date||'':'';
    return bD.localeCompare(aD)
  })

  return {upcoming:upcoming,tours2027:tours2027,completed:completed}
}

// ── Sidebar ─────────────────────────────────────────────────────
function Side({tours,selTour,pickTour,selBk,pickBk,loading}){
  var [exp,setExp]=useState(null)
  var [collG,setCollG]=useState({upcoming:false,tours2027:false,completed:true})
  useEffect(function(){if(selTour)setExp(selTour.id)},[selTour])

  var groups=groupTours(tours||[])

  function renderGroup(label,groupTours,groupKey,count){
    var isC=collG[groupKey]
    if(!groupTours.length)return null
    return React.createElement('div',{key:groupKey},
      React.createElement('button',{onClick:function(){var n=Object.assign({},collG);n[groupKey]=!isC;setCollG(n)},
        style:{display:'flex',width:'100%',textAlign:'left',padding:'10px 18px',border:'none',cursor:'pointer',background:c.sf2,color:c.mu,fontFamily:bf,fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:1,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid '+c.bd}},
        React.createElement('span',null,label+' ('+count+')'),
        React.createElement('span',{style:{fontSize:10,transform:isC?'rotate(0deg)':'rotate(180deg)',transition:'transform 0.15s',display:'inline-block'}},'▾')),
      isC?null:groupTours.map(function(tour){
        var isE=exp===tour.id,isS=selTour&&selTour.id===tour.id,bks=tour.bookings||[]
        return React.createElement('div',{key:tour.id},
          React.createElement('button',{onClick:function(){if(isE&&isS)setExp(null);else{pickTour(tour);pickBk(null);setExp(tour.id)}},
            style:{display:'flex',width:'100%',textAlign:'left',gap:8,padding:'10px 18px',border:'none',cursor:'pointer',background:isS?c.bld:'transparent',color:isS?c.bl:c.tx,fontFamily:bf,fontSize:13,fontWeight:600,alignItems:'center'},
            onMouseEnter:function(e){if(!isS)e.currentTarget.style.background=c.sf2},onMouseLeave:function(e){if(!isS)e.currentTarget.style.background='transparent'}},
            React.createElement('span',{style:{fontSize:10,color:c.dm,transform:isE?'rotate(90deg)':'none',transition:'transform 0.15s',display:'inline-block'}},'▶'),
            React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},tour.name),
            React.createElement('span',{style:{fontSize:10,color:c.dm,fontFamily:mf,flexShrink:0}},(tour.confirmed||0)+'/'+(tour.count||0))),
          isE?React.createElement('div',{style:{paddingBottom:4}},bks.slice().sort(function(a,b){return(a.Check_in_Date||'').localeCompare(b.Check_in_Date||'')}).map(function(bk){
            var isA=selBk&&selBk.id===bk.id
            return React.createElement('button',{key:bk.id,onClick:function(){pickBk(bk)},
              style:{display:'flex',width:'100%',textAlign:'left',padding:'5px 18px 5px 42px',border:'none',cursor:'pointer',background:isA?c.sf3:'transparent',fontFamily:bf,fontSize:12,alignItems:'center',gap:8,color:isA?c.tx:c.mu},
              onMouseEnter:function(e){if(!isA)e.currentTarget.style.background=c.sf2},onMouseLeave:function(e){if(!isA)e.currentTarget.style.background='transparent'}},
              React.createElement(Dot,{status:bk.Lodge_Availability||bk.Status}),
              React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},bk.Lodge_Name||bk.Name),
              React.createElement('span',{style:{fontSize:10,color:c.dm,fontFamily:mf,flexShrink:0}},fmt(bk.Check_in_Date)))})):null)
      }))
  }

  return React.createElement('div',{style:{width:280,flexShrink:0,background:c.sf,borderRight:'1px solid '+c.bd,height:'100vh',overflow:'auto',position:'sticky',top:0}},
    React.createElement('button',{onClick:function(){pickTour(null);pickBk(null)},style:{display:'block',width:'100%',textAlign:'left',padding:'16px 18px',background:'transparent',border:'none',borderBottom:'1px solid '+c.bd,fontSize:14,fontWeight:700,color:c.tx,letterSpacing:-0.3,cursor:'pointer',fontFamily:bf}},'RDS Bookings'),
    React.createElement('div',{style:{padding:'0'}},
      loading?React.createElement(Spin,{t:'Loading...'}):
      React.createElement('div',null,
        renderGroup('Upcoming 2026',groups.upcoming,'upcoming',groups.upcoming.reduce(function(s,t){return s+t.count},0)),
        renderGroup('2027 Tours',groups.tours2027,'tours2027',groups.tours2027.reduce(function(s,t){return s+t.count},0)),
        renderGroup('Completed',groups.completed,'completed',groups.completed.reduce(function(s,t){return s+t.count},0))
      )
    ))
}

// ── App ─────────────────────────────────────────────────────────
export default function App(){
  var [tours,setTours]=useState([])
  var [allBks,setAllBks]=useState([])
  var [selTour,setSelTour]=useState(null)
  var [selBk,setSelBk]=useState(null)
  var [loading,setLoading]=useState(true)

  useEffect(function(){
    fetch(API+'/api/bp-data').then(function(r){return r.json()}).then(function(d){
      setTours(d.tours||[]);var all=[];(d.tours||[]).forEach(function(t){all=all.concat(t.bookings||[])});setAllBks(all);setLoading(false)
    }).catch(function(){setLoading(false)})
  },[])

  return React.createElement('div',{style:{fontFamily:bf,background:c.bg,color:c.tx,minHeight:'100vh',display:'flex'}},
    React.createElement('link',{rel:'stylesheet',href:'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'}),
    React.createElement(Side,{tours:tours,selTour:selTour,pickTour:setSelTour,selBk:selBk,pickBk:setSelBk,loading:loading}),
    React.createElement('div',{style:{flex:1,padding:'24px 32px',overflow:'auto',minHeight:'100vh'}},
      loading?React.createElement(Spin,{t:'Loading bookings...'}):
      selBk?React.createElement(LodgeDet,{bk:selBk,onBack:function(){setSelBk(null)}}):
      selTour?React.createElement(TourView,{tour:selTour,bookings:selTour.bookings||[],allBks:allBks,onSelectBooking:setSelBk}):
      React.createElement('div',null,
        React.createElement('h1',{style:{fontSize:20,fontWeight:700,marginBottom:4}},'All Tours — Overview'),
        React.createElement('div',{style:{fontSize:13,color:c.mu,marginBottom:20}},allBks.length+' lodge bookings across '+tours.length+' tours'),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}},
          React.createElement(DC,{title:'Upcoming Payments',icon:'💰',accent:c.or},React.createElement(PayCard,{bookings:allBks,showTour:true})),
          React.createElement(DC,{title:'Accommodation Snags',icon:'⚠️',accent:c.rd},React.createElement(SnagCard,{bookings:allBks,showTour:true})),
          React.createElement(DC,{title:'Claude Activity (48h)',icon:'🤖',accent:c.pu},React.createElement(ClCard,{bookings:allBks,showTour:true})),
          React.createElement(DC,{title:'To Do',icon:'📋',accent:c.bl},React.createElement(TodoCard,{bookings:allBks,showTour:true}))))
    )
  )
}
