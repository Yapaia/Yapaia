ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm

# Leere Vorgabe für die Integration -- der Bau ersetzt sie per
# `--build-context yapaia-integration=integration/custom_components`.
FROM scratch AS yapaia-integration

FROM ${BUILD_FROM}

# ffmpeg nimmt das Bild vom Grabber (v4l2) und macht JPEGs daraus,
# v4l-utils (v4l2-ctl) sagt, welche Geräte und Eingänge es gibt,
# die Schrift braucht nur das Testbild.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg v4l-utils fonts-dejavu-core \
        python3 python3-aiohttp \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
