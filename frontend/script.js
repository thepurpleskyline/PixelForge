function openLogin() {
    document.getElementById("loginOverlay").style.display = "flex";
    document.body.style.overflow = "hidden"; //Prevents Background scrolling
}

function closeLogin() {
    document.getElementById("loginOverlay").style.display = "none";
    document.body.style.overflow = "visible"; //Re-enables Background scrolling
}

function openRegister() {
    closeLogin();
    document.getElementById("registerOverlay").style.display= "flex";
    document.body.style.overflow = "hidden";
}

function closeRegister() {
    document.getElementById("registerOverlay").style.display = "none";
    document.body.style.overflow = "auto";
}

function validateRegistration() {
    const pass = document.getElementById("regPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (pass !== confirm) {
        alert("Error: Passwords do not match! Re-initialize entry.");
        return false;
    }
    
    alert("Identity Confirmed. Ready for Backend Integration.");
    return true;
}