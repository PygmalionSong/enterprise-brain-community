// Shared mobile filter disclosure; existing scope/time controls remain unchanged.
// 共用手机筛选折叠，保留原地域和期间控件。
export function enhanceMobileCockpit(root,locale='zh'){
 const time=root.querySelector('.bc-timebar'),geo=root.querySelector('.v8-geobar');if(!time&&!geo){root.querySelector('[data-mobile-filters]')?.remove();return;}
 let toggle=root.querySelector('[data-mobile-filters]');if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.dataset.mobileFilters='';toggle.className='mobile-filter-toggle';toggle.addEventListener('click',()=>{const open=root.dataset.mobileFiltersOpen!=='true';root.dataset.mobileFiltersOpen=String(open);toggle.setAttribute('aria-expanded',String(open));});root.querySelector('#bc-nav').insertAdjacentElement('afterend',toggle);}
 const title={zh:'范围与期间',en:'Scope and period',ja:'地域・期間'}[locale]||'Scope and period',context=geo?.querySelector('.v8-current-scope')?.textContent?.trim()||'';
 const caption=title+(context?' · '+context:'');if(toggle.textContent!==caption)toggle.textContent=caption;toggle.setAttribute('aria-expanded',String(root.dataset.mobileFiltersOpen==='true'));toggle.setAttribute('aria-controls','mobile-time-controls mobile-scope-controls');if(time)time.id='mobile-time-controls';if(geo)geo.id='mobile-scope-controls';
}
