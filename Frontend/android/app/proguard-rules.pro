# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-config reads the generated BuildConfig fields through reflection.
-keep class com.yeogidamm.app.BuildConfig { *; }

# Kakao Maps SDK uses classes and interfaces that must not be shrunk or obfuscated.
-keep class com.kakao.vectormap.** { *; }
-keep interface com.kakao.vectormap.**
