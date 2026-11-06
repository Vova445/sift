import {createElement as h} from 'react';
import {publicVerdictLabel} from './public-verdict-policy.js';

const labels={buy:'КУПУВАТИ',wait:'ПОЧЕКАТИ',close:'ЗАКРИТИ ВКЛАДКУ'};
const colors={buy:{bg:'#26341d',fg:'#c7ff81'},wait:{bg:'#3a2d19',fg:'#ffd183'},close:{bg:'#3b211d',fg:'#ff9b8e'}};

export function publicVerdictImage(card){
  const decisionColor=colors[card.decision]||colors.wait;
  return h('div',{style:{width:'1200px',height:'630px',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'54px 68px',background:'#11150e',color:'#f8faf6',fontFamily:'geist, sans-serif'}},
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'13px',fontSize:'26px',fontWeight:900,letterSpacing:'5px'}},
        h('span',{style:{width:'44px',height:'44px',borderRadius:'13px',background:'#b8f35f',color:'#11150e',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'25px',letterSpacing:0}},'S'),'SIFT'),
      h('div',{style:{fontSize:'14px',fontWeight:850,letterSpacing:'3px',color:'#a7b09f'}},'ПУБЛІЧНА КАРТКА ВЕРДИКТУ')),
    h('div',{style:{height:'400px',display:'flex',alignItems:'center',gap:'56px',padding:'25px 45px',border:'1px solid #343d31',borderRadius:'30px',background:'#151a13'}},
      h('div',{style:{display:'flex',alignItems:'baseline',gap:'9px',minWidth:'510px',color:'#b8f35f'}},
        h('strong',{style:{fontSize:'220px',lineHeight:1,letterSpacing:'-17px',fontVariantNumeric:'tabular-nums'}},String(card.score)),
        h('span',{style:{fontSize:'27px',fontWeight:750,color:'#a7b09f'}},'/100')),
      h('div',{style:{height:'190px',width:'1px',background:'#3c4438'}}),
      h('div',{style:{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'18px'}},
        h('span',{style:{fontSize:'15px',fontWeight:850,letterSpacing:'3px',color:'#b8f35f'}},'CLARITY SCORE'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px',padding:'13px 17px',borderRadius:'999px',background:decisionColor.bg,color:decisionColor.fg,fontSize:'19px',fontWeight:900,letterSpacing:'1px'}},
          h('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:decisionColor.fg}}),labels[card.decision]),
        h('span',{style:{maxWidth:'400px',fontSize:'18px',lineHeight:1.4,color:'#c3c9bf'}},publicVerdictLabel(card.decision)))),
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'16px',color:'#a7b09f'}},
      h('span',null,'Лише оцінка та загальний вердикт · назва сервісу прихована'),
      h('span',{style:{fontWeight:800,letterSpacing:'2px',color:'#f8faf6'}},'SIFT  ·  KNOW BEFORE YOU PAY')));
}
