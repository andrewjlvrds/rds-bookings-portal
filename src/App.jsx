import React, { useState, useEffect } from 'react'

var API = ''
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

function Badge({status}){var s=gs(status);return React.createElement('span',{style:{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,background:s.bg,color:s.fg,fontFamily:mf,whiteSpace:'nowrap'}},s.i+' '+(status||'—'))}
function Dot({status}){var map={'Available':c.gn,'Confirmed':c.gn,'Provisional':c.yl,'Checking':c.or,'Unavailable':c.rd,'Full':c.rd,'Deposit Paid':c.gn,'Paid in Full':c.gn,'Enquiry Sent':c.or,'Pending':c.yl};return React.createElement('div',{title:status||'?',style:{width:10,height:10,borderRadius:'50%',background:map[status]||c.dm,boxShadow:'0 0 6px '+(map[status]||c.dm)+'60',flexShrink:0}})}
function Spin({t}){return React.createElement('div',{style:{padding:40,textAlign:'center',color:c.mu,fontSize:13}},t||'Loading...')}

// ── Dashboard Card ──────────────────────────────────────────────
function DC({title,icon,accent,children}){
  return React.createElement('div',{style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:10,overflow:'hidden',minHeight:160}},
    React.createElement('div',{style:{padding:'12px 16px',borderBottom:'1px solid '+c.bd,fontSize:11,fontWeight:600,color:accent||c.mu,textTransform:'uppercase',letterSpacing:1,display:'flex',alignItems:'center',gap:8}},icon,' ',title),
    React.createElement('div',{style:{padding:'8px 16px 14px'}},children))
}

function PayCard({bookings,showTour}){
  var now=new Date().toISOString().split('T')[0],list=[]
  ;(bookings||[]).forEach(function(bk){[['Deposit',bk.Deposit_Due_Date,bk.Deposit_Amount],['2nd',bk.Second_Payment_Due_Date,bk.Second_Payment_Amount],['3rd',bk.Third_Payment_Due_Date,bk.Third_Payment_Amount],['4th',bk.Fourth_Payment_Due_Date,bk.Fourth_Payment_Amount]].forEach(function(d){if(d[1]&&d[2])list.push({lodge:bk.Lodge_Name||bk.Name,tour:bk.tour_name||'',label:d[0],date:d[1],amt:d[2],cur:bk.Lodge_Currency||'',od:d[1]<now})})})
  list.sort(function(a,b){return a.date.localeCompare(b.date)})
  if(!list.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No upcoming payments')
  return React.createElement('div',null,list.slice(0,8).map(function(p,i){return React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<Math.min(list.length,8)-1?'1px solid '+c.bd:'none',fontSize:12}},React.createElement('div',null,React.createElement('div',{style:{fontWeight:500,color:c.tx}},p.lodge),React.createElement('div',{style:{color:p.od?c.rd:c.dm,fontSize:11}},(showTour?p.tour+' · ':'')+p.label+' · '+fmtF(p.date)+(p.od?' — OVERDUE':''))),React.createElement('div',{style:{fontFamily:mf,fontSize:12,fontWeight:600,color:p.od?c.rd:c.tx}},$(p.amt,p.cur)))}))
}

function SnagCard({bookings,showTour}){
  var snags=(bookings||[]).filter(function(b){return b.Lodge_Availability==='Unavailable'||b.Lodge_Availability==='Full'||b.Status==='Cancelled'||b.Status==='Waitlisted'||b.Claude_Confidence==='Low'})
  if(!snags.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'All bookings looking good ✓')
  return React.createElement('div',null,snags.slice(0,8).map(function(bk,i){var r=bk.Lodge_Availability==='Unavailable'||bk.Lodge_Availability==='Full'?'Unavailable':bk.Status==='Cancelled'?'Cancelled':bk.Status==='Waitlisted'?'Waitlisted':'Needs review';return React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<snags.length-1?'1px solid '+c.bd:'none',fontSize:12}},React.createElement('div',null,React.createElement('div',{style:{fontWeight:500,color:c.tx}},bk.Lodge_Name||bk.Name),React.createElement('div',{style:{color:c.dm,fontSize:11}},(showTour?bk.tour_name+' · ':'')+fmt(bk.Check_in_Date))),React.createElement('span',{style:{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:c.rdd,color:c.rd,fontFamily:mf}},r))}))
}

function ClCard({bookings,showTour}){
  var cut=new Date(Date.now()-48*3600000).toISOString().split('T')[0]
  var rec=(bookings||[]).filter(function(b){return b.Claude_Updated_Time&&b.Claude_Updated_Time>=cut}).sort(function(a,b){return(b.Claude_Updated_Time||'').localeCompare(a.Claude_Updated_Time||'')})
  if(!rec.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No updates in the last 48h')
  return React.createElement('div',null,rec.slice(0,6).map(function(bk,i){var cc=bk.Claude_Confidence;return React.createElement('div',{key:i,style:{padding:'6px 0',borderBottom:i<Math.min(rec.length,6)-1?'1px solid '+c.bd:'none',fontSize:12}},React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},React.createElement('span',{style:{fontWeight:500,color:c.tx}},bk.Lodge_Name||bk.Name),React.createElement('span',{style:{fontSize:10,padding:'1px 5px',borderRadius:3,fontFamily:mf,background:cc==='High'?c.gnd:cc==='Medium'?c.yld:c.ord,color:cc==='High'?c.gn:cc==='Medium'?c.yl:c.or,fontWeight:600}},cc)),React.createElement('div',{style:{fontSize:11,color:c.dm}},(showTour?bk.tour_name+' · ':'')+(bk.Reservation_Comments||'').substring(0,80)))}))
}

function TodoCard({bookings,showTour}){
  var todos=[],now=new Date().toISOString().split('T')[0]
  ;(bookings||[]).forEach(function(bk){if(bk.Status==='Enquiry Sent'){if(bk.Follow_up_Date&&bk.Follow_up_Date<=now)todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Follow up overdue',p:'high'});else todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Awaiting lodge response',p:'medium'})};if(bk.Claude_Confidence==='Low')todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Review Claude extraction',p:'high'});if(bk.Status==='Provisional'&&!bk.Deposit_Amount)todos.push({l:bk.Lodge_Name,t:bk.tour_name,task:'Request proforma / deposit',p:'medium'})})
  todos.sort(function(a,b){return a.p==='high'&&b.p!=='high'?-1:b.p==='high'&&a.p!=='high'?1:0})
  if(!todos.length)return React.createElement('div',{style:{fontSize:12,color:c.dm,padding:'6px 0'}},'No action items ✓')
  return React.createElement('div',null,todos.slice(0,8).map(function(t,i){return React.createElement('div',{key:i,style:{padding:'6px 0',borderBottom:i<Math.min(todos.length,8)-1?'1px solid '+c.bd:'none',fontSize:12}},React.createElement('div',{style:{fontWeight:500,color:c.tx}},t.l),React.createElement('div',{style:{color:t.p==='high'?c.rd:c.or,fontSize:11}},(showTour?t.t+' · ':'')+t.task))}))
}

// ── Guests Table ────────────────────────────────────────────────
function GuestsView({guests,loading}){
  if(loading)return React.createElement(Spin,{t:'Loading guests...'})
  if(!guests||!guests.length)return React.createElement('div',{style:{padding:30,textAlign:'center',color:c.dm,fontSize:13,background:c.sf,borderRadius:8,border:'1px solid '+c.bd}},'No guest bookings found')
  var hs={fontSize:11,fontWeight:600,padding:'10px 12px',background:c.sf2,borderBottom:'2px solid '+c.bd,color:c.mu,textTransform:'uppercase',letterSpacing:0.5,textAlign:'left',position:'sticky',top:0}
  var td={fontSize:12,padding:'10px 12px',borderBottom:'1px solid '+c.bd,verticalAlign:'top'}
  return React.createElement('div',{style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,overflow:'auto'}},
    React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',minWidth:800}},
      React.createElement('thead',null,React.createElement('tr',null,
        ['Guest','Status','Nationality','Room','Bike','Dietary/Medical','T&Cs','Insurance','Emergency'].map(function(h,i){return React.createElement('th',{key:i,style:hs},h)}))),
      React.createElement('tbody',null,guests.map(function(g,i){
        var statusStyle=g.status==='Confirmed'?{color:c.gn}:g.status==='Cancelled'?{color:c.rd}:{color:c.mu}
        return React.createElement('tr',{key:g.id||i,style:{transition:'background 0.1s'},
          onMouseEnter:function(e){e.currentTarget.style.background=c.sf2},
          onMouseLeave:function(e){e.currentTarget.style.background='transparent'}},
          // Name + contact
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontWeight:600,color:c.tx}},g.name),
            React.createElement('div',{style:{fontSize:11,color:c.dm}},g.email),
            g.phone?React.createElement('div',{style:{fontSize:11,color:c.dm}},g.phone):null,
            g.pillion_name?React.createElement('div',{style:{fontSize:11,color:c.pu}},'+ Pillion: '+g.pillion_name):null
          ),
          // Status
          React.createElement('td',{style:td},React.createElement(Badge,{status:g.status})),
          // Nationality
          React.createElement('td',{style:td},React.createElement('span',{style:{color:c.tx}},g.nationality||'—')),
          // Room
          React.createElement('td',{style:td},
            React.createElement('div',{style:{color:c.tx}},g.room_pref||'—'),
            g.single_room?React.createElement('div',{style:{fontSize:10,color:c.yl,fontWeight:600}},'SINGLE'):null
          ),
          // Bike
          React.createElement('td',{style:td},
            React.createElement('div',{style:{color:c.tx}},g.bike_pref||'—'),
            g.own_bike?React.createElement('div',{style:{fontSize:10,color:c.bl}},'Own: '+g.own_bike):null
          ),
          // Dietary/Medical
          React.createElement('td',{style:td},
            g.dietary?React.createElement('div',{style:{color:c.or,fontSize:11}},g.dietary):null,
            g.medical?React.createElement('div',{style:{color:c.rd,fontSize:11}},g.medical):null,
            !g.dietary&&!g.medical?React.createElement('span',{style:{color:c.dm}},'—'):null
          ),
          // T&Cs
          React.createElement('td',{style:td},
            React.createElement('div',{style:{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',
              background:g.tcs_checked?c.gnd:c.rdd,color:g.tcs_checked?c.gn:c.rd,fontSize:12,fontWeight:700}},
              g.tcs_checked?'✓':'✗')
          ),
          // Insurance
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontSize:11,color:g.insurance1?c.tx:c.dm}},g.insurance1||'—'),
            g.insurance_details?React.createElement('div',{style:{fontSize:10,color:c.dm}},g.insurance_details.substring(0,40)):null
          ),
          // Emergency
          React.createElement('td',{style:td},
            React.createElement('div',{style:{fontSize:11,color:g.emergency?c.tx:c.dm}},g.emergency||'—')
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
    // Room requirements summary
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

    // Crew members
    (!crew||!crew.length)?React.createElement('div',{style:{padding:30,textAlign:'center',color:c.dm,fontSize:13,background:c.sf,borderRadius:8,border:'1px solid '+c.bd}},'No crew assigned to this tour'):
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}},
      crew.map(function(m,i){
        var roleColor=m.role==='Lead Guide'?c.bl:m.role==='Guide 2'?c.gn:m.role==='Driver'?c.or:c.mu
        return React.createElement('div',{key:i,style:{background:c.sf,border:'1px solid '+c.bd,borderRadius:8,padding:16}},
          React.createElement('div',{style:{fontSize:10,fontWeight:600,color:roleColor,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}},m.role),
          React.createElement('div',{style:{fontSize:15,fontWeight:600,color:c.tx}},m.name)
        )
      })
    )
  )
}

// ── Tour View (with tabs) ───────────────────────────────────────
function TourView({tour,bookings,allBks,onSelectBooking}){
  var [tourTab,setTourTab]=useState('dashboard')
  var [detail,setDetail]=useState(null) // {guests,crew,tourInfo}
  var [detLoad,setDetLoad]=useState(false)

  // Fetch guests and crew when tour changes
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

    // Tour tabs
    React.createElement('div',{style:{display:'flex',gap:2,marginBottom:20,borderBottom:'1px solid '+c.bd}},
      tabs.map(function(t){var a=tourTab===t.id;return React.createElement('button',{key:t.id,onClick:function(){setTourTab(t.id)},
        style:{padding:'10px 18px',border:'none',cursor:'pointer',background:'transparent',fontFamily:bf,fontSize:13,fontWeight:500,color:a?c.bl:c.mu,borderBottom:a?'2px solid '+c.bl:'2px solid transparent',marginBottom:-1}},t.l)})),

    // Tab content
    tourTab==='dashboard'?React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}},
      React.createElement(DC,{title:'Upcoming Payments',icon:'💰',accent:c.or},React.createElement(PayCard,{bookings:bookings})),
      React.createElement(DC,{title:'Accommodation Snags',icon:'⚠️',accent:c.rd},React.createElement(SnagCard,{bookings:bookings})),
      React.createElement(DC,{title:'Claude Activity (48h)',icon:'🤖',accent:c.pu},React.createElement(ClCard,{bookings:bookings})),
      React.createElement(DC,{title:'To Do',icon:'📋',accent:c.bl},React.createElement(TodoCard,{bookings:bookings}))
    ):null,

    tourTab==='itinerary'?React.createElement('div',null,
      (bookings||[]).map(function(bk,i){
        var s=gs(bk.Status)
        return React.createElement('button',{key:bk.id,onClick:function(){onSelectBooking(bk)},
          style:{display:'flex',width:'100%',textAlign:'left',background:c.sf,border:'1px solid '+c.bd,borderRadius:8,padding:'14px 18px',marginBottom:8,cursor:'pointer',fontFamily:bf,color:c.tx,alignItems:'center',gap:14,transition:'border-color 0.15s'},
          onMouseEnter:function(e){e.currentTarget.style.borderColor=c.bl},
          onMouseLeave:function(e){e.currentTarget.style.borderColor=c.bd}},
          // Day number
          React.createElement('div',{style:{width:44,height:44,borderRadius:8,background:c.sf2,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0}},
            React.createElement('div',{style:{fontSize:10,color:c.dm,lineHeight:1}},fmt(bk.Check_in_Date).split(' ')[1]),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,lineHeight:1.2}},new Date(bk.Check_in_Date).getDate())
          ),
          // Lodge info
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
          // Status + amount
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
  useEffect(function(){setELoad(true);setExpE(null);setTab('correspondence');fetch(API+'/api/emails?booking_id='+bk.id).then(function(r){return r.json()}).then(function(d){setEmails(d.emails||[]);setELoad(false)}).catch(function(){setEmails([]);setELoad(false)})},[bk.id])
  var tabs=[{id:'correspondence',l:'Correspondence',n:emails.length},{id:'payments',l:'Payments'},{id:'documents',l:'Documents'},{id:'details',l:'Details'}]
  return React.createElement('div',null,
    React.createElement('button',{onClick:onBack,style:{background:'none',border:'none',color:c.bl,fontSize:13,cursor:'pointer',padding:'0 0 12px',fontFamily:bf}},'← Back to itinerary'),
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}},
      React.createElement('div',null,
        React.createElement('h1',{style:{fontSize:20,fontWeight:700,margin:0}},bk.Lodge_Name||bk.Name),
        React.createElement('div',{style:{fontSize:13,color:c.mu,marginTop:2}},fmtF(bk.Check_in_Date)+' → '+fmtF(bk.Check_out_Date)+(bk.Nights?' · '+bk.Nights+'n':'')),
        bk.Day_Description?React.createElement('div',{style:{fontSize:12,color:c.mu,marginTop:4,fontStyle:'italic'}},bk.Day_Description):null),
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},React.createElement(Dot,{status:bk.Lodge_Availability||bk.Status}),React.createElement(Badge,{status:bk.Status}))),
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
  if(!emails.length)return React.createElement('div',{style:{padding:30,textAlign:'center',color:c.dm,fontSize:13,background:c.sf,borderRadius:8,border:'1px solid '+c.bd}},'No emails captured yet for this booking.')
  var sorted=emails.slice().sort(function(a,b){return(a.date||'').localeCompare(b.date||'')})
  return React.createElement('div',null,sorted.map(function(e,i){var inn=e.direction==='inbound',isE=exp===(e.id||i),bc=inn?c.gn:c.bl;return React.createElement('div',{key:e.id||i,style:{borderLeft:'3px solid '+bc,paddingLeft:16,marginBottom:16,cursor:'pointer'},onClick:function(){setExp(isE?null:(e.id||i))}},React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:2}},React.createElement('span',{style:{color:bc,fontWeight:600}},(inn?'↓ RECEIVED':'↑ SENT')+'  '+(e.from||'')),React.createElement('span',{style:{color:c.dm}},fmtDT(e.date))),React.createElement('div',{style:{fontSize:13,fontWeight:500,marginBottom:4}},e.subject||'(no subject)'),!isE?React.createElement('div',{style:{fontSize:12,color:c.mu,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(e.body||e.ai_summary||'').substring(0,150)):React.createElement('div',null,React.createElement('div',{style:{fontSize:12,color:c.mu,whiteSpace:'pre-wrap',lineHeight:1.6,padding:14,background:c.sf2,borderRadius:8,marginTop:6,maxHeight:400,overflow:'auto',border:'1px solid '+c.bd}},e.body||'(no body)'),e.ai_summary?React.createElement('div',{style:{marginTop:8,padding:'10px 12px',background:c.pud,borderRadius:6,fontSize:12,lineHeight:1.5}},React.createElement('span',{style:{color:c.pu,fontWeight:600,fontSize:11}},'CLAUDE: '),React.createElement('span',{style:{color:c.mu}},e.ai_summary)):null,e.attachments&&e.attachments.length?React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}},e.attachments.map(function(a,j){return React.createElement('span',{key:j,style:{fontSize:11,padding:'4px 10px',borderRadius:4,background:c.sf2,border:'1px solid '+c.bd,color:c.mu}},'📎 '+(a.name||a))})):null))}))
}
function payTab(bk){var pys=[['Deposit',bk.Deposit_Due_Date,bk.Deposit_Amount],['2nd Payment',bk.Second_Payment_Due_Date,bk.Second_Payment_Amount],['3rd Payment',bk.Third_Payment_Due_Date,bk.Third_Payment_Amount],['4th Payment',bk.Fourth_Payment_Due_Date,bk.Fourth_Payment_Amount]].filter(function(p){return p[1]||p[2]});var cur=bk.Lodge_Currency||bk.Currency||'',now=new Date().toISOString().split('T')[0];return React.createElement('div',{style:{background:c.sf,borderRadius:8,border:'1px solid '+c.bd,overflow:'hidden'}},bk.Total_Amount?React.createElement('div',{style:{padding:'14px 18px',borderBottom:'1px solid '+c.bd,display:'flex',justifyContent:'space-between'}},React.createElement('span',{style:{fontSize:13,fontWeight:600}},'Total'),React.createElement('span',{style:{fontSize:16,fontWeight:700,fontFamily:mf}},$(bk.Total_Amount,cur))):null,!pys.length?React.createElement('div',{style:{padding:20,fontSize:12,color:c.dm}},'No payment schedule set'):pys.map(function(p,i){var od=p[1]&&p[1]<now;return React.createElement('div',{key:i,style:{padding:'12px 18px',borderBottom:i<pys.length-1?'1px solid '+c.bd:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}},React.createElement('div',null,React.createElement('div',{style:{fontSize:13,fontWeight:500}},p[0]),p[1]?React.createElement('div',{style:{fontSize:11,color:od?c.rd:c.dm}},'Due: '+fmtF(p[1])+(od?' — OVERDUE':'')):null),React.createElement('span',{style:{fontFamily:mf,fontSize:14,fontWeight:600,color:od?c.rd:c.tx}},$(p[2],cur)))}))}
function docTab(){return React.createElement('div',{style:{background:c.sf,borderRadius:8,border:'1px solid '+c.bd,padding:20}},React.createElement('div',{style:{fontSize:13,color:c.mu}},'Documents from email correspondence will appear here.'),React.createElement('div',{style:{fontSize:12,color:c.dm,marginTop:8}},'STO rates, proformas, and invoices extracted from lodge emails.'))}
function detTab(bk){var fs=[['Status',bk.Status],['Availability',bk.Lodge_Availability],['Check-in',fmtF(bk.Check_in_Date)],['Check-out',fmtF(bk.Check_out_Date)],['Nights',bk.Nights],['Single',bk.Pax_in_Single_Rooms||bk.Single_Rooms],['Shared Dbl',bk.Pax_in_Shared_Double||bk.Shared_Double_Rooms],['Shared Twn',bk.Pax_in_Shared_Twin||bk.Shared_Twin_Rooms],['Guides',bk.Number_of_guides||bk.Guide_Rooms],['Config',bk.Sgl_Twin_Dbl_Guides],['Meals',bk.Meals],['Total',$(bk.Total_Amount,bk.Lodge_Currency)],['Deposit',$(bk.Deposit_Amount,bk.Lodge_Currency)],['Rate',bk.Exchange_Rate],['Ref',bk.Booking_Reference],['Contact',bk.Contact_Name],['Email',bk.Email],['Follow-up',fmtF(bk.Follow_up_Date)],['Km',bk.Km],['Excursion',bk.Excursion],['Exc Status',bk.Excursion_booking_status],['Claude',bk.Claude_Confidence],['Claude Date',fmtF(bk.Claude_Updated_Time)]].filter(function(f){return f[1]&&f[1]!=='—'});return React.createElement('div',null,React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1,background:c.bd,borderRadius:8,overflow:'hidden'}},fs.map(function(f,i){return React.createElement('div',{key:i,style:{background:c.sf,padding:'10px 14px'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:2}},f[0]),React.createElement('div',{style:{fontSize:13,fontWeight:500}},f[1]))}),bk.Reservation_Comments?React.createElement('div',{style:{background:c.sf,padding:'10px 14px',gridColumn:'1/-1'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}},'Reservation Comments'),React.createElement('div',{style:{fontSize:12,color:c.mu,whiteSpace:'pre-wrap',lineHeight:1.5}},bk.Reservation_Comments)):null,bk.Booking_Notes?React.createElement('div',{style:{background:c.sf,padding:'10px 14px',gridColumn:'1/-1'}},React.createElement('div',{style:{fontSize:10,color:c.dm,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}},'Booking Notes'),React.createElement('div',{style:{fontSize:12,color:c.mu,whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:200,overflow:'auto'}},bk.Booking_Notes)):null))}

// ── Sidebar ─────────────────────────────────────────────────────
function Side({tours,selTour,pickTour,selBk,pickBk,loading}){
  var [exp,setExp]=useState(null)
  useEffect(function(){if(selTour)setExp(selTour.id)},[selTour])
  return React.createElement('div',{style:{width:280,flexShrink:0,background:c.sf,borderRight:'1px solid '+c.bd,height:'100vh',overflow:'auto',position:'sticky',top:0}},
    React.createElement('button',{onClick:function(){pickTour(null);pickBk(null)},style:{display:'block',width:'100%',textAlign:'left',padding:'16px 18px',background:'transparent',border:'none',borderBottom:'1px solid '+c.bd,fontSize:14,fontWeight:700,color:c.tx,letterSpacing:-0.3,cursor:'pointer',fontFamily:bf}},'RDS Bookings'),
    React.createElement('div',{style:{padding:'8px 0'}},
      loading?React.createElement(Spin,{t:'Loading...'}):
      (tours||[]).map(function(tour){
        var isE=exp===tour.id,isS=selTour&&selTour.id===tour.id,bks=tour.bookings||[]
        return React.createElement('div',{key:tour.id},
          React.createElement('button',{onClick:function(){if(isE&&isS)setExp(null);else{pickTour(tour);pickBk(null);setExp(tour.id)}},
            style:{display:'flex',width:'100%',textAlign:'left',gap:8,padding:'10px 18px',border:'none',cursor:'pointer',background:isS?c.bld:'transparent',color:isS?c.bl:c.tx,fontFamily:bf,fontSize:13,fontWeight:600,alignItems:'center'},
            onMouseEnter:function(e){if(!isS)e.currentTarget.style.background=c.sf2},onMouseLeave:function(e){if(!isS)e.currentTarget.style.background='transparent'}},
            React.createElement('span',{style:{fontSize:10,color:c.dm,transform:isE?'rotate(90deg)':'none',transition:'transform 0.15s',display:'inline-block'}},'▶'),
            React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},tour.name),
            React.createElement('span',{style:{fontSize:10,color:c.dm,fontFamily:mf,flexShrink:0}},tour.confirmed+'/'+tour.count)),
          isE?React.createElement('div',{style:{paddingBottom:4}},bks.map(function(bk){
            var isA=selBk&&selBk.id===bk.id
            return React.createElement('button',{key:bk.id,onClick:function(){pickBk(bk)},
              style:{display:'flex',width:'100%',textAlign:'left',padding:'5px 18px 5px 42px',border:'none',cursor:'pointer',background:isA?c.sf3:'transparent',fontFamily:bf,fontSize:12,alignItems:'center',gap:8,color:isA?c.tx:c.mu},
              onMouseEnter:function(e){if(!isA)e.currentTarget.style.background=c.sf2},onMouseLeave:function(e){if(!isA)e.currentTarget.style.background='transparent'}},
              React.createElement(Dot,{status:bk.Lodge_Availability||bk.Status}),
              React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},bk.Lodge_Name||bk.Name),
              React.createElement('span',{style:{fontSize:10,color:c.dm,fontFamily:mf,flexShrink:0}},fmt(bk.Check_in_Date)))})):null)
      })))
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

  var viewBks=selTour?selTour.bookings||[]:allBks

  return React.createElement('div',{style:{fontFamily:bf,background:c.bg,color:c.tx,minHeight:'100vh',display:'flex'}},
    React.createElement('link',{rel:'stylesheet',href:'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'}),
    React.createElement(Side,{tours:tours,selTour:selTour,pickTour:setSelTour,selBk:selBk,pickBk:setSelBk,loading:loading}),
    React.createElement('div',{style:{flex:1,padding:'24px 32px',overflow:'auto',minHeight:'100vh'}},
      loading?React.createElement(Spin,{t:'Loading bookings...'}):
      selBk?React.createElement(LodgeDet,{bk:selBk,onBack:function(){setSelBk(null)}}):
      selTour?React.createElement(TourView,{tour:selTour,bookings:selTour.bookings||[],allBks:allBks,onSelectBooking:setSelBk}):
      // Global dashboard
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
