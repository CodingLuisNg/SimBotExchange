cmake_minimum_required(VERSION 3.15)
project(MatchingEngine C CXX)

set(CMAKE_CXX_STANDARD 17)

find_package(PkgConfig REQUIRED)
pkg_check_modules(PROTOBUF REQUIRED protobuf)
pkg_check_modules(GRPC REQUIRED grpc++)

set(Protobuf_LIBRARIES ${PROTOBUF_LIBRARIES})
set(Protobuf_INCLUDE_DIRS ${PROTOBUF_INCLUDE_DIRS})

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/proto")
    set(PROTO_DIR "${CMAKE_CURRENT_SOURCE_DIR}/proto")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../proto")
    set(PROTO_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../proto")
else()
    message(FATAL_ERROR "Cannot find proto directory")
endif()

set(PROTO_SRCS
    ${PROTO_DIR}/orderbook.proto
    ${PROTO_DIR}/marketdata.proto
)

set(PROTO_GEN_DIR "${CMAKE_CURRENT_BINARY_DIR}/proto_gen")
file(MAKE_DIRECTORY ${PROTO_GEN_DIR})

function(generate_proto_sources PROTO_FILE)
    get_filename_component(PROTO_NAME ${PROTO_FILE} NAME_WE)
    set(PROTO_SRC "${PROTO_GEN_DIR}/${PROTO_NAME}.pb.cc")
    set(PROTO_HDR "${PROTO_GEN_DIR}/${PROTO_NAME}.pb.h")
    set(GRPC_SRC "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.cc")
    set(GRPC_HDR "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.h")

    add_custom_command(
        OUTPUT ${PROTO_SRC} ${PROTO_HDR} ${GRPC_SRC} ${GRPC_HDR}
        COMMAND ${_GRPC_CPP_PLUGIN_EXECUTABLE}
        ARGS --grpc_out=${PROTO_GEN_DIR}
             --cpp_out=${PROTO_GEN_DIR}
             -I ${PROTO_DIR}
             --plugin=protoc-gen-grpc=${_GRPC_CPP_PLUGIN_EXECUTABLE}
             ${PROTO_FILE}
        DEPENDS ${PROTO_FILE}
    )

endfunction()

find_program(GRPC_CPP_PLUGIN grpc_cpp_plugin
    PATHS /opt/homebrew/bin /usr/local/bin /usr/bin
    REQUIRED)

add_custom_command(
    OUTPUT "${PROTO_GEN_DIR}/orderbook.pb.cc" "${PROTO_GEN_DIR}/orderbook.pb.h" "${PROTO_GEN_DIR}/orderbook.grpc.pb.cc" "${PROTO_GEN_DIR}/orderbook.grpc.pb.h"
           "${PROTO_GEN_DIR}/marketdata.pb.cc" "${PROTO_GEN_DIR}/marketdata.pb.h" "${PROTO_GEN_DIR}/marketdata.grpc.pb.cc" "${PROTO_GEN_DIR}/marketdata.grpc.pb.h"
    COMMAND protoc
    ARGS --grpc_out=${PROTO_GEN_DIR}
         --cpp_out=${PROTO_GEN_DIR}
         -I ${PROTO_DIR}
         --plugin=protoc-gen-grpc=${GRPC_CPP_PLUGIN}
         ${PROTO_SRCS}
    DEPENDS ${PROTO_SRCS}
)

include_directories(${PROTO_GEN_DIR})
include_directories(${PROTOBUF_INCLUDE_DIRS})
include_directories(${GRPC_INCLUDE_DIRS})

link_directories(${PROTOBUF_LIBRARY_DIRS})
link_directories(${GRPC_LIBRARY_DIRS})

add_executable(MatchingEngine
    src/main.cpp
    "${PROTO_GEN_DIR}/orderbook.pb.cc"
    "${PROTO_GEN_DIR}/orderbook.grpc.pb.cc"
    "${PROTO_GEN_DIR}/marketdata.pb.cc"
    "${PROTO_GEN_DIR}/marketdata.grpc.pb.cc"
)

target_link_libraries(MatchingEngine
    ${PROTOBUF_LDFLAGS}
    ${GRPC_LDFLAGS}
    grpc++_reflection
    pthread
)
