// Preserve container layout, with viewport-query fallbacks for older WebViews.
// 保留容器布局，并为旧WebView提供视口查询回退。
export function mobileStyles(base,mobile){const fallback=base.split(/\r?\n/).filter(line=>line.startsWith('@container brain (')).map(line=>line.replace('@container brain (','@media (')).join('\n');return '\n@supports not (container-type:inline-size){'+fallback+'}\n'+mobile;}
