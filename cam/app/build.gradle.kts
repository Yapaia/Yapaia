plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.yapaia.cam"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.yapaia.cam"
        minSdk = 28
        targetSdk = 35
        versionCode = 13
        versionName = "0.6.2"
    }

    // Signiert wird nicht hier, sondern auf dem Mini-PC (cam/signieren.sh):
    // der Schlüssel bleibt auf dem Gerät, das Repo ist öffentlich.
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
