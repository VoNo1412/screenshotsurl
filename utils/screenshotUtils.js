const captureScreenshotClientReact = async (link) => {
    if (link.includes("didongviet")) {
        return await captureScreenshotClientReactDiDongViet(link);
    }
    if (link.includes("thegioididong")) {
        return await captureScreenshotClientReactTheGioiDiDong(link);
    }
    if (link.includes("24hstore")) {
        return await captureScreenshotClientReact24Store(link);
    }
    if (link.includes("hoangha")) {
        return await captureScreenshotClientReactHoangHa(link);
    }
    throw new Error('Unsupported link type');
};

module.exports = {
    captureScreenshotClientReact,
};
