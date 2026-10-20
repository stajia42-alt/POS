#!/usr/bin/env bash
# Source this file to activate the cloud toolchain. Nothing is installed here.
export AVILES_TOOLS_ROOT="${AVILES_TOOLS_ROOT:-/workspace/tools}"
export JAVA_HOME="$AVILES_TOOLS_ROOT/jdk21/usr/lib/jvm/msopenjdk-21-amd64"
export ANDROID_HOME="$AVILES_TOOLS_ROOT/android-sdk"
export ANDROID_USER_HOME=/workspace/.cache/android
export GRADLE_USER_HOME=/workspace/.cache/gradle
export npm_config_cache=/workspace/.cache/npm
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# Reuse the machine's trusted CA store, including its managed HTTPS proxy CA.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=/workspace/.cache/java-home -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
