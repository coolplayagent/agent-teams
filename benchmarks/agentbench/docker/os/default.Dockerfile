FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        coreutils \
        curl \
        findutils \
        gawk \
        git \
        grep \
        net-tools \
        procps \
        python3 \
        python3-pip \
        sed \
        sudo \
        tree \
        unzip \
        vim \
        wget \
        zip

WORKDIR /root
CMD ["bash"]
