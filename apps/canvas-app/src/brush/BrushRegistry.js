export const BRUSHES = {
    pencil: {
        id: 'pencil',
        name: 'Pencil',
        category: 'Sketching',
        tipType: 'round-hard',
        spacing: 0.1,
        smoothing: 0.3,
        dynamics: {
            pressureToSize: 0.7,
            pressureToOpacity: 0.8,
            velocityToSize: 0.0,
            minSize: 0.3,
            minOpacity: 0.1,
        },
    },
    ink: {
        id: 'ink',
        name: 'Ink',
        category: 'Inking',
        tipType: 'round-hard',
        spacing: 0.05,
        smoothing: 0.7,
        dynamics: {
            pressureToSize: 1.0,
            pressureToOpacity: 0.0,
            velocityToSize: 0.3,
            minSize: 0.2,
            minOpacity: 1.0,
        },
    },
    airbrush: {
        id: 'airbrush',
        name: 'Airbrush',
        category: 'Airbrushing',
        tipType: 'round-soft',
        spacing: 0.15,
        smoothing: 0.5,
        dynamics: {
            pressureToSize: 0.3,
            pressureToOpacity: 1.0,
            velocityToSize: 0.0,
            minSize: 0.8,
            minOpacity: 0.02,
        },
    },
    marker: {
        id: 'marker',
        name: 'Marker',
        category: 'Inking',
        tipType: 'flat',
        spacing: 0.08,
        smoothing: 0.4,
        angle: Math.PI / 6,
        dynamics: {
            pressureToSize: 0.8,
            pressureToOpacity: 0.2,
            velocityToSize: 0.0,
            minSize: 0.5,
            minOpacity: 0.7,
        },
    },
    watercolor: {
        id: 'watercolor',
        name: 'Watercolor',
        category: 'Painting',
        tipType: 'noise',
        spacing: 0.2,
        smoothing: 0.6,
        dynamics: {
            pressureToSize: 0.5,
            pressureToOpacity: 0.9,
            velocityToSize: 0.2,
            minSize: 0.4,
            minOpacity: 0.05,
        },
    },
    softBrush: {
        id: 'softBrush',
        name: 'Soft Brush',
        category: 'Painting',
        tipType: 'round-soft',
        spacing: 0.15,
        smoothing: 0.5,
        dynamics: {
            pressureToSize: 0.8,
            pressureToOpacity: 0.7,
            velocityToSize: 0.1,
            minSize: 0.3,
            minOpacity: 0.1,
        },
    },
};

export function getBrushById(id) {
    return BRUSHES[id] || BRUSHES.pencil;
}

export function getBrushesByCategory() {
    const categories = {};
    for (const brush of Object.values(BRUSHES)) {
        if (!categories[brush.category]) {
            categories[brush.category] = [];
        }
        categories[brush.category].push(brush);
    }
    return categories;
}
