/**
 * export.js
 * Handles the PDF generation of the modal content
 */

export async function exportModalToPDF() {
    const element = document.getElementById('post-details');
    
    // Configuration for the PDF
    const options = {
        margin:       10,
        filename:     'TPCraw_Analysis_Report.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, // Crucial for loading external Shields.io badges
            logging: false,
            letterRendering: true
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Temporarily hide navigation buttons and "View" buttons so they don't appear in the report
    const nav = element.querySelector('.modal-nav-container');
    const actionButtons = element.querySelectorAll('button');
    
    if (nav) nav.style.opacity = '0';
    actionButtons.forEach(btn => btn.style.display = 'none');

    try {
        // html2pdf is a global provided by the script tag in index.html
        await html2pdf().set(options).from(element).save();
    } catch (error) {
        console.error("PDF Export failed:", error);
        alert("Failed to generate PDF. Please ensure the html2pdf library is loaded.");
    } finally {
        // Restore visibility
        if (nav) nav.style.opacity = '1';
        actionButtons.forEach(btn => btn.style.display = 'inline-block');
    }
}