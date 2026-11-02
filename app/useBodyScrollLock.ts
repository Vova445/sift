'use client';

import {useEffect} from 'react';

type SavedBodyStyles={
  overflow:string;
  position:string;
  top:string;
  left:string;
  right:string;
  width:string;
  paddingRight:string;
  scrollY:number;
};

let activeLocks=0;
let savedBodyStyles:SavedBodyStyles|null=null;

export function useBodyScrollLock(locked:boolean){
  useEffect(()=>{
    if(!locked)return;

    const body=document.body;
    if(activeLocks===0){
      const scrollbarWidth=Math.max(0,window.innerWidth-document.documentElement.clientWidth);
      const computedPaddingRight=Number.parseFloat(window.getComputedStyle(body).paddingRight)||0;
      savedBodyStyles={
        overflow:body.style.overflow,
        position:body.style.position,
        top:body.style.top,
        left:body.style.left,
        right:body.style.right,
        width:body.style.width,
        paddingRight:body.style.paddingRight,
        scrollY:window.scrollY,
      };

      body.style.overflow='hidden';
      body.style.position='fixed';
      body.style.top=`-${savedBodyStyles.scrollY}px`;
      body.style.left='0';
      body.style.right='0';
      body.style.width='100%';
      if(scrollbarWidth>0)body.style.paddingRight=`${computedPaddingRight+scrollbarWidth}px`;
    }

    activeLocks+=1;
    return()=>{
      activeLocks=Math.max(0,activeLocks-1);
      if(activeLocks!==0||!savedBodyStyles)return;

      const previous=savedBodyStyles;
      body.style.overflow=previous.overflow;
      body.style.position=previous.position;
      body.style.top=previous.top;
      body.style.left=previous.left;
      body.style.right=previous.right;
      body.style.width=previous.width;
      body.style.paddingRight=previous.paddingRight;
      window.scrollTo(0,previous.scrollY);
      savedBodyStyles=null;
    };
  },[locked]);
}
