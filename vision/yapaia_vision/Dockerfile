ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm

# Leere Vorgabe für die Integration -- der Bau ersetzt sie per
# `--build-context yapaia-integration=integration/custom_components`.
FROM scratch AS yapaia-integration

# --------------------------------------------------------------------------
# somagic-init / somagic-capture / somagic-extract-firmware (GPL-2.0+) für
# den Somagic SMI2021CBE (EasyCAP002 „4CH USB DVR“): kein Kernel-Treiber,
# die Programme sprechen den Stick über libusb an. Siehe yapaia/somagic.py.
# --------------------------------------------------------------------------
FROM ${BUILD_FROM} AS somagic

ARG SOMAGIC_REPO=https://github.com/pimartos/easycap-somagic-linux
ARG SOMAGIC_COMMIT=59b2daaeefc54b0da40d470fc12017a0e590fbf5

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential git ca-certificates libusb-1.0-0-dev libgcrypt20-dev \
    && git clone "${SOMAGIC_REPO}" /src \
    && git -C /src checkout "${SOMAGIC_COMMIT}" \
    && make -C /src/user somagic-init somagic-capture \
    && tar xzf /src/packages/somagic-easycap-tools_1.1.tar.gz -C /src \
    && make -C /src/somagic-easycap-tools_1.1 somagic-extract-firmware \
    && install -m 0755 /src/user/somagic-init /src/user/somagic-capture \
        /src/somagic-easycap-tools_1.1/somagic-extract-firmware /usr/local/bin/

FROM ${BUILD_FROM}

# ffmpeg nimmt das Bild vom Grabber (v4l2) und macht JPEGs daraus,
# v4l-utils (v4l2-ctl) sagt, welche Geräte und Eingänge es gibt,
# die Schrift braucht nur das Testbild.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg v4l-utils fonts-dejavu-core \
        libusb-1.0-0 libgcrypt20 p7zip-full \
        python3 python3-aiohttp \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=somagic /usr/local/bin/somagic-init /usr/local/bin/somagic-capture /usr/local/bin/somagic-extract-firmware /usr/local/bin/
# früh scheitern, wenn eine Bibliothek fehlt
RUN if ldd /usr/local/bin/somagic-* | grep "not found"; then exit 1; fi
COPY rootfs /
COPY --from=yapaia-integration / /opt/yapaia/integration/

ARG BUILD_VERSION=dev
ENV YAPAIA_VERSION=${BUILD_VERSION} \
    YAPAIA_APP=/opt/yapaia \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/yapaia

RUN chmod a+x /etc/s6-overlay/s6-rc.d/yapaia/run /etc/s6-overlay/s6-rc.d/yapaia/finish

LABEL \
    io.hass.name="Yapaia Vision" \
    io.hass.description="Analog cameras via a USB video grabber" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    org.opencontainers.image.title="Yapaia Vision" \
    org.opencontainers.image.source="https://github.com/Yapaia/yapaia" \
    org.opencontainers.image.licenses="MIT"
