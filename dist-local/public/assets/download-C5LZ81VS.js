function n(t,c){const e=document.createElement("a"),o=URL.createObjectURL(t);e.href=o,e.download=c,e.click(),window.setTimeout(()=>{URL.revokeObjectURL(o)},0)}export{n as d};
