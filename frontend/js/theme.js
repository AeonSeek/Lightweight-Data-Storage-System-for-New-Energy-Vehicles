const themeToggleBtn = document.getElementById('theme-toggle-btn');
const htmlElement = document.documentElement;

// Function to apply the theme and update the button icon
function applyTheme(theme) {
    htmlElement.setAttribute('data-theme', theme);
    if (themeToggleBtn) {
        const icon = themeToggleBtn.querySelector('i');
        if (icon) { // Ensure icon element exists
            if (theme === 'dark') {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            } else {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        }
    }
}

// Function to initialize and manage theme
function initializeTheme() {
    let preferredTheme = localStorage.getItem('theme');

    if (!preferredTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        preferredTheme = 'dark';
    }
    // Default to 'light' if no preference or system preference is not dark
    if (!preferredTheme) {
        preferredTheme = 'light';
    }

    applyTheme(preferredTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let newTheme = htmlElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }

    // Listen for system theme changes
    if (window.matchMedia) {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        prefersDarkScheme.addEventListener('change', (e) => {
            // Apply system preference only if no theme is explicitly set by the user in localStorage
            if (!localStorage.getItem('theme')) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
}

// Initialize theme on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeTheme); 