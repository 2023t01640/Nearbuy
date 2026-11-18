export function downloadCSV(name, rows) {
  const escape = v => '"'+String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"','""')+'"';
  const content = '\ufeff'+rows.map(row=>row.map(escape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a'); a.href=url; a.download=name+'.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadPDF(name, lines) {
 const { jsPDF } = await import('jspdf');
 const pdf=new jsPDF(); pdf.setFillColor(35,97,77); pdf.rect(0,0,210,36,'F'); pdf.setTextColor(255); pdf.setFontSize(22); pdf.text('NearBuy',16,22); pdf.setTextColor(30); pdf.setFontSize(17); pdf.text(name,16,51); pdf.setFontSize(10); pdf.text('Frontend demo report | Generated '+new Date().toLocaleDateString('en-GB'),16,61);
 let y=76; lines.forEach(line=>{const chunks=pdf.splitTextToSize(String(line),175); if(y+chunks.length*6>275){pdf.addPage();y=20;} pdf.text(chunks,16,y);y+=chunks.length*6+5;});pdf.save(name.toLowerCase().replaceAll(' ','-')+'.pdf');
}
