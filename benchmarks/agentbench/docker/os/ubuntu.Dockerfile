FROM ubuntu:22.04

RUN echo "tmp" > /file.txt

WORKDIR /root
CMD ["bash"]
