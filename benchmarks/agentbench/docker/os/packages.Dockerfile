FROM local-os/default

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends npm

WORKDIR /root
CMD ["bash"]
