import {createElement as h} from 'react';
import {publicVerdictLabel} from './public-verdict-policy.js';

const labels={buy:'КУПУВАТИ',wait:'ПОЧЕКАТИ',close:'ЗАКРИТИ ВКЛАДКУ'};

export function publicVerdictImage(card){
  return h('div',{style:{width:'1200px',height:'630px',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'58px 68px',background:'#f3f5f0',color:'#11150e',fontFamily:'geist, sans-serif'}},
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'14px',fontSize:'26px',fontWeight:900,letterSpacing:'5px'}},
        h('span',{style:{width:'44px',height:'44px',borderRadius:'13px',background:'#b8f35f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'25px',letterSpacing:0}},'S'),'SIFT'),
      h('div',{style:{fontSize:'14px',fontWeight:800,letterSpacing:'3px',color:'#747b70'}},'ПУБЛІЧНА КАРТКА ВЕРДИКТУ')),
    h('div',{style:{display:'flex',alignItems:'center',gap:'54px',padding:'42px 48px',background:'#11150e',borderRadius:'30px',color:'#ffffff'}},
      h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px',minWidth:'310px'}},
        h('strong',{style:{fontSize:'190px',lineHeight:1,letterSpacing:'-13px'}},String(card.score)),
        h('span',{style:{fontSize:'28px',fontWeight:700,color:'#a5ad9e'}},'/100')),
      h('div',{style:{height:'150px',width:'1px',background:'#3c4438'}}),
      h('div',{style:{display:'flex',flexDirection:'column',gap:'18px'}},
        h('span',{style:{fontSize:'15px',fontWeight:800,letterSpacing:'3px',color:'#b8f35f'}},'CLARITY SCORE'),
        h('strong',{style:{fontSize:'33px',lineHeight:1.25}},labels[card.decision]),
        h('span',{style:{fontSize:'18px',color:'#c3c9bf'}},publicVerdictLabel(card.decision)))),
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'17px',color:'#737b70'}},
      h('span',null,'Показано лише оцінку та загальний вердикт'),
      h('span',null,'sift.app · know before you pay')));
}
