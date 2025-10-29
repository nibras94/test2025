// ******************************************************
// 1. الإعدادات والثوابت (قم بتحديث هذه القيم)
// ******************************************************
const firebaseConfig = {
    // تأكد من أن هذا هو مفتاحك الصحيح
    apiKey: "AIzaSyBsLA4c8GHgsmrUS7f2g8gQxUrBAQgU6_c", 
    authDomain: "mytvapplicenses.firebaseapp.com",
    projectId: "mytvapplicenses", 
    storageBucket: "mytvapplicenses.firebasestorage.app",
    messagingSenderId: "333462771235",
    appId: "1:333462771235:web:xxxxxxxxxxxxxx"
};
const COLLECTION_NAME = "licenses";
const CHECK_INTERVAL = 25000; 
const LOCAL_DEVICE_ID_KEY = 'local_device_uid'; 

// **جدول الترجمة للمراحل الدراسية (للعرض في صفحة الملف الشخصي)**
const COURSE_TRANSLATIONS = {
    'primary6': 'السادس الابتدائي',
    'middle3': 'الثالث المتوسط',
    'prep6_sci': 'السادس الإعدادي (علمي)',
    'prep6_lit': 'السادس الإعدادي (أدبي)'
};


// عناصر DOM (من المفترض أن تكون موجودة في index.html)
const licenseForm = document.getElementById('license-form'); 
const licenseCodeInput = document.getElementById('licenseCodeInput');
const messageElement = document.getElementById('message');

// عناصر النافذة المنبثقة
const loginModal = document.getElementById('login-modal');
const openModalButtons = document.querySelectorAll('#open-login-modal-button, #open-modal-center-button');
const closeModalButton = document.getElementById('close-modal-button');

let db;


// ******************************************************
// 2. الدوال المساعدة والأساسية
// ******************************************************

function openLoginModal() {
    if(loginModal) {
        loginModal.classList.remove('hidden');
    }
    if (messageElement) {
        messageElement.textContent = '';
    }
}

function closeLoginModal() {
    if(loginModal) {
        loginModal.classList.add('hidden');
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getLocalDeviceID() {
    let deviceId = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = generateUUID();
        localStorage.setItem(LOCAL_DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

function showMessage(msg, isError = false) {
    if (messageElement) {
        messageElement.textContent = msg;
        messageElement.className = isError ? 'text-red-600 mt-4 text-center text-base font-medium' : 'text-green-600 mt-4 text-center text-base font-medium';
    }
}

function parseExpiryDate(expiryString) {
    if (!expiryString || !expiryString.startsWith("EXPIRY-")) return null;
    const dateParts = expiryString.substring(7).trim().split(/[\s:-]/);
    if (dateParts.length !== 7) return null;
    const [year, month, day, hour12, minute, second, ampm] = dateParts.map((p, i) => i === 6 ? p : parseInt(p));
    let hour = hour12;
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute, second);
}

// وظيفة تسجيل الخروج (تحذف الكود والاسم وقائمة المراحل)
function logout() {
    localStorage.removeItem('course_license_key');
    localStorage.removeItem('user_name');
    localStorage.removeItem('allowed_courses'); 
    window.location.href = 'index.html'; 
}
window.logout = logout; 

// دالة التحقق الدوري من الصلاحية (تستخدم في courses.html و profile.html)
async function checkLicenseValidity() {
    const storedLicense = localStorage.getItem('course_license_key');
    const isProtectedPage = window.location.pathname.includes('courses.html') || window.location.pathname.includes('profile.html') || window.location.pathname.includes('course_page.html');
    
    if (!storedLicense && isProtectedPage) {
        logout();
        return false;
    }
    
    if (storedLicense) {
        try {
            // **الإصلاح الأمني:** ضمان وجود توثيق مجهول للقراءة
            await firebase.auth().signInAnonymously();

            const docRef = db.collection(COLLECTION_NAME).doc(storedLicense);
            const doc = await docRef.get();

            const storedUserName = localStorage.getItem('user_name');
            const licenseCodeDisplay = document.getElementById('license-code-display'); 
            
            if (licenseCodeDisplay && storedUserName) {
                 licenseCodeDisplay.textContent = `مرحباً: ${storedUserName}`;
            }
            
            if (!doc.exists) {
                alert("تم إلغاء ترخيصك بواسطة المسؤول.");
                logout();
                return false;
            }

            const data = doc.data();
            const licenseCode = data.licenseCode;
            const comparisonDate = parseExpiryDate(licenseCode);
            
            if (!comparisonDate || comparisonDate.getTime() <= new Date().getTime()) {
                alert("انتهت صلاحية ترخيصك. يرجى التجديد.");
                logout();
                return false;
            }
            
            // **الإضافة:** تحديث قائمة المراحل المسموح بها في الذاكرة المحلية
            const allowedCourses = JSON.stringify(data.allowedCourses || []);
            localStorage.setItem('allowed_courses', allowedCourses);
            
            // إعادة عرض حالات الدورات في courses.html إذا كانت مفتوحة
            if (window.location.pathname.includes('courses.html') && typeof window.renderCourseStates === 'function') {
                window.renderCourseStates();
            }

            // إعادة جلب البيانات للملف الشخصي إذا كان مفتوحاً
            if (window.location.pathname.includes('profile.html')) {
                renderProfileData(doc);
            }

            return true; 
            
        } catch (error) {
            console.error("Firebase Check Error:", error);
            // قد يكون خطأ اتصال، لا نسجل الخروج فوراً
            return true; 
        }
    }
    
    return false;
}


// وظيفة تسجيل الدخول (في index.html) 
async function handleLogin(e) {
    e.preventDefault();
    
    const deviceId = licenseCodeInput.value.trim();
    showMessage("جاري التحقق من الترخيص...", false);

    if (!deviceId) {
        showMessage("الرجاء إدخال كود الترخيص.", true);
        return;
    }

    try {
        // **الإصلاح الأمني:** التوثيق المجهول قبل محاولة القراءة
        await firebase.auth().signInAnonymously();

        const docRef = db.collection(COLLECTION_NAME).doc(deviceId);
        const doc = await docRef.get();

        if (!doc.exists) {
            showMessage("كود الترخيص غير موجود. يرجى التأكد من الكود.", true);
            return;
        }

        const data = doc.data();
        const licenseCode = data.licenseCode;
        const userName = data.userName || "مستخدم جديد"; 
        // **الإضافة:** جلب قائمة المراحل المسموح بها
        const allowedCourses = JSON.stringify(data.allowedCourses || []);

        const comparisonDate = parseExpiryDate(licenseCode);
        
        if (!comparisonDate) {
            showMessage("هيكل بيانات الترخيص غير صالح. يرجى مراجعة المسؤول.", true);
            return;
        }

        const now = new Date();
        
        if (comparisonDate.getTime() > now.getTime()) {
            
            // 1. تسجيل الدخول بنجاح وحفظ البيانات الجديدة
            localStorage.setItem('course_license_key', deviceId); 
            localStorage.setItem('user_name', userName); 
            localStorage.setItem('allowed_courses', allowedCourses); // حفظ المراحل
            
            // 2. الإغلاق والتحويل المباشر
            closeLoginModal();
            window.location.href = 'courses.html'; 
            
        } else {
            // الترخيص منتهٍ
            const formattedExpiry = comparisonDate.toLocaleString('en-US', { 
                 year: 'numeric', month: 'numeric', day: 'numeric', 
                 hour: '2-digit', minute: '2-digit', second: '2-digit', 
                 hour12: true, numberingSystem: 'latn' 
            });
            
            showMessage(`عذراً، ترخيصك منتهٍ. انتهى في: ${formattedExpiry}. يرجى التجديد.`, true);
        }

    } catch (error) {
        console.error("Error during login:", error);
        showMessage(`حدث خطأ أثناء التحقق من الترخيص: ${error.message}`, true);
    }
}

// ******************************************************
// 4. وظيفة جلب وعرض بيانات الملف الشخصي (profile.html)
// ******************************************************

async function renderProfileData(initialDoc = null) {
    const storedLicense = localStorage.getItem('course_license_key');
    const storedUserName = localStorage.getItem('user_name'); 
    
    const profileUserName = document.getElementById('profile-user-name');
    const profileLicenseCode = document.getElementById('profile-license-code');
    const profileStatus = document.getElementById('profile-status');
    const profileExpiryDate = document.getElementById('profile-expiry-date');
    const profileAllowedCourses = document.getElementById('profile-allowed-courses'); 

    if (!storedLicense) {
        return; 
    }

    if (profileUserName) profileUserName.textContent = storedUserName || 'مستخدم غير معروف';
    if (profileLicenseCode) profileLicenseCode.textContent = storedLicense;
    
    let doc;
    if (initialDoc) {
        doc = initialDoc;
    } else {
         try {
            // ضمان وجود توثيق مجهول
            await firebase.auth().signInAnonymously();
            const docRef = db.collection(COLLECTION_NAME).doc(storedLicense);
            doc = await docRef.get();
        } catch (error) {
             console.error("Profile Data Fetch Error:", error);
             if (profileStatus) profileStatus.textContent = 'خطأ في جلب البيانات';
             return;
        }
    }
    
    if (!doc || !doc.exists) {
        if (profileStatus) profileStatus.textContent = 'ملغى';
        if (profileStatus) profileStatus.className = 'text-red-400 font-bold';
        if (profileExpiryDate) profileExpiryDate.textContent = 'غير متوفر';
        return;
    }

    const data = doc.data();
    const licenseCode = data.licenseCode;
    const comparisonDate = parseExpiryDate(licenseCode);
    const now = new Date();

    if (comparisonDate.getTime() > now.getTime()) {
        if (profileStatus) profileStatus.textContent = 'فعّال';
        if (profileStatus) profileStatus.className = 'text-green-400 font-bold';
        
    } else {
        if (profileStatus) profileStatus.textContent = 'منتهي الصلاحية';
        if (profileStatus) profileStatus.className = 'text-red-400 font-bold';
    }
    
    const formattedExpiry = comparisonDate.toLocaleString('en-US', { 
        year: 'numeric', month: 'numeric', day: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', 
        hour12: true, numberingSystem: 'latn' 
    });
    if (profileExpiryDate) profileExpiryDate.textContent = formattedExpiry;

    // **التعديل هنا: ترجمة وعرض المواد المسموح بها بالعربية**
    const allowedCourses = data.allowedCourses || [];
    if (profileAllowedCourses) {
        if (allowedCourses.length > 0) {
            profileAllowedCourses.innerHTML = allowedCourses.map(courseKey => {
                // استخدام جدول الترجمة
                const courseName = COURSE_TRANSLATIONS[courseKey] || courseKey;
                return `<span class="inline-block bg-indigo-600 text-white text-xs px-3 py-1 rounded-full m-1">${courseName}</span>`;
            }).join('');
        } else {
            profileAllowedCourses.textContent = 'لا توجد مراحل مسموح بها.';
        }
    }
}


// ******************************************************
// 3. التهيئة وبدء التحقق الدوري (تنطلق في كل صفحة)
// ******************************************************
function initializeApp() {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // التحقق من توفر الـ auth (للتأكد من أن المكتبة تم استدعاؤها في الـ HTML)
        if (!firebase.auth) {
             console.error("Firebase Auth library is missing. Please include firebase-auth-compat.js.");
             return;
        }

        const isCoursesPage = window.location.pathname.includes('courses.html');
        const isProfilePage = window.location.pathname.includes('profile.html');
        const isCoursePage = window.location.pathname.includes('course_page.html'); // تم الإضافة
        const storedLicense = localStorage.getItem('course_license_key');
        
        // --- منطق index.html ---
        if (licenseForm) { 
            licenseForm.addEventListener('submit', handleLogin);
            
            openModalButtons.forEach(button => {
                button.addEventListener('click', openLoginModal);
            });
            if (closeModalButton) {
                closeModalButton.addEventListener('click', closeLoginModal);
            }
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && loginModal && !loginModal.classList.contains('hidden')) {
                    closeLoginModal();
                }
            });
        }
        
        // --- منطق صفحات الحماية (courses.html, profile.html, course_page.html) ---
        if (isCoursesPage || isProfilePage || isCoursePage) {
            // التحقق من صلاحية الترخيص والتحويل في حالة عدم الصلاحية
            setInterval(checkLicenseValidity, CHECK_INTERVAL);
            checkLicenseValidity();
        }
        
        // --- منطق الملف الشخصي: جلب البيانات عند التحميل ---
        if (isProfilePage) {
            renderProfileData();
        }

        // --- منطق التحويل العام (الحماية) ---
        if (storedLicense && (window.location.pathname.endsWith('/index.html') || window.location.pathname.endsWith('/'))) {
            window.location.href = 'courses.html';
            return; 
        }
        
        // تفعيل التنقل السلس لروابط التنقل في index.html
        if (!isCoursesPage && !isProfilePage && !isCoursePage) {
            document.querySelectorAll('.navbar a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href');
                    const targetElement = document.querySelector(targetId);
                    
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth' });
                    } else if (targetId === '#course-content') {
                         window.location.href = 'courses.html';
                    }
                });
            });
        }
        
    } catch (error) {
        console.error("Firebase Init Error:", error);
    }
}

// بدء التشغيل
initializeApp();