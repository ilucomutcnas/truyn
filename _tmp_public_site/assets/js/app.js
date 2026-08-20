function applyLang(lang){
  const d=T[lang]||T.en;
  const meta=langMeta[lang]||langMeta.en;
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==="ar"?"rtl":"ltr";
  document.querySelectorAll("[data-t]").forEach(el=>{
    const v=d[el.dataset.t];
    if(v!=null){
      if(el.dataset.t==="hero") el.innerHTML=v.replace("\\n","<br>");
      else el.textContent=v;
    }
  });
  langCode.textContent=meta.code;
  if(META[lang]){
    document.title=META[lang][0];
    const desc=document.querySelector('meta[name="description"]');
    if(desc) desc.setAttribute("content",META[lang][1]);
  }
  langMenu.querySelectorAll("[data-lang]").forEach(btn=>{
    btn.setAttribute("aria-selected",String(btn.dataset.lang===lang));
  });
  localStorage.setItem("truyn-lang",lang);
}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  const icon=document.getElementById("themeIcon");
  const btn=document.getElementById("themeToggle");
  const isLight=theme==="light";
  icon.textContent=isLight ? "â˜¼" : "â˜¾";
  btn.setAttribute("aria-label",isLight ? "Switch to dašÈ[YHˆˆ”İÚ]ÚÈYÚ[YHŠNÂˆ‹œÙ]]šX]J]H‹\ÓYÚÈ”İÚ]ÚÈ\šÈ[YHˆˆ”İÚ]ÚÈYÚ[YHŠNÂˆØØ[İÜ˜YÙKœÙ]][J^[‹][YH‹[YJNÂŸB‚›[™Ğ]Û‹˜Y]™[\İ[™\Š˜ÛXÚÈ‹OOÂˆKœİÜ›ÜYØ][ÛŠ
NÂˆÙ][™ÓY[J[[™ÓY[K˜Û\ÜÓ\İ˜ÛÛZ[œÊ›Ü[ˆŠJNÂŸJNÂ›[™ÓY[Kœ]Y\TÙ[XİÜ[
–Ù]K[[™×HŠK™›Ü‘XXÚ
OÂˆ‹˜Y]™[\İ[™\Š˜ÛXÚÈ‹

OOÂˆ\S[™Ê‹™]\Ù]›[™ÊNÂˆÙ][™ÓY[J˜[ÙJNÂˆ[™Ğ]Û‹™›Øİ\Ê
NÂˆJNÂŸJNÂ™Øİ[Y[˜Y]™[\İ[™\Š˜ÛXÚÈ‹OOÂˆYŠ[[™ÔXÚÙ\‹˜ÛÛZ[œÊK\™Ù]
JHÙ][™ÓY[J˜[ÙJNÂŸJNÂ™Øİ[Y[˜Y]™[\İ[™\ŠšÙ^YİÛˆ‹OOÂˆYŠKšÙ^OOOH‘\ØØ\HŠ^ÜÙ][™ÓY[J˜[ÙJNÛ[™Ğ]Û‹™›Øİ\Ê
NßBŸJNÂÚ[™İË˜Y]™[\İ[™\Šœ™\Ú^™H‹

OOœÙ][™ÓY[J˜[ÙJKÜ\ÜÚ]™NY_JNÂÚ[™İË˜Y]™[\İ[™\Š›ÜšY[][Û˜Ú[™ÙH‹

OOœÙ][™ÓY[J˜[ÙJKÜ\ÜÚ]™NY_JNÂ™Øİ[Y[™Ù][[Y[RY
[YUÙÙÛHŠK˜Y]™[\İ[™\Š˜ÛXÚÈ‹

OOÂˆ\U[YJØİ[Y[™Øİ[Y[[[Y[™]\Ù][YOOOH›YÚˆÈ™\šÈˆˆ›YÚŠNÂŸJNÂ‚˜\S[™ÊØØ[İÜ˜YÙK™Ù]][J^[‹[[™ÈŠ_™[ˆŠNÂ˜\U[YJØØ[İÜ˜YÙK™Ù]][J^[‹][YHŠ_
X]ÚYYXJŠ™Y™\œËXÛÛÜ‹\ØÚ[YN™\šÊHŠK›X]Ú\ÏÈ™\šÈˆ›YÚŠJNÂ‚™Øİ[Y[œ]Y\TÙ[XİÜ[
‹˜ÛÜHŠK™›Ü‘XXÚ
OÂˆ‹˜Y]™[\İ[™\Š˜ÛXÚÈ‹\Ş[˜Ê
OOÂˆ^Ø]ØZ]˜]šYØ]Ü‹˜Û\›Ø\™Üš]U^
‹™]\Ù]˜ÛÙJ_XØ]Ú
J^ÂˆÛÛœİYØİ[Y[˜Ü™X]Q[[Y[
^\™XHŠNİ˜[YOX‹™]\Ù]˜ÛÙNÙØİ[Y[˜›ÙK˜\[™Ú[

NİœÙ[Xİ

NÙØİ[Y[™^XĞÛÛ[X[™
˜ÛÜHŠNİœ™[[İ™J
NÂˆBˆÛÛœİ[™Ï[ØØ[İÜ˜YÙK™Ù]][J^[‹[[™ÈŠ_™[ˆÂˆÛÛœİUÛ[™×_™[Âˆ‹^ÛÛ[Y˜ÛÜYYÂˆÙ][Y[İ]


OO˜‹^ÛÛ[Y˜ÛÜKL
NÂˆJNÂŸJNÂ