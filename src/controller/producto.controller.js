const path = require('path');
const { request, response } = require('express');
const db = require('../database/postgres-connection');
const { uploadFile, deleteFile } = require('../helpers');   
const Producto = require('../models/Neo4j/producto');
const Categoria = require('../models/Neo4j/categoria');
const producto = new Producto();
const cateNeo = new Categoria();
// const redis = require('../database/redis-connection');
// const axios = require('axios');
// const { Client } = require('redis-om');

const uploadImg = async (req = request, res = response) => {
    try {
        const path = await uploadFile(req.files.archivo, ['png', 'jpg', 'jpeg','webp']);
 
        res.status(200).json({
            ok: true,
            message: 'Imagen subida con exito',
            path
        });

    }
    catch (error) {
        //If there is an error return the error
        return res.status(500).json({
            ok: false,
            message: 'Error al actualizar la imagen del producto',
            error
        });
    }
}

const create = async (req = request, res = response) => {
    const { proveedor_id } = req.params;
    const { marca_id, imagen, titulo, descripcion } = req.body;
    try {
        //validate the existence of the provider
        const proveedor = await db.query(`SELECT * FROM proveedor WHERE proveedor_id = ${proveedor_id}`);
        if (proveedor.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El proveedor no existe'
            });
        }

        //validate the brand of marca
        const marca = await db.query(`SELECT * FROM marca WHERE marca_id = ${marca_id}`);
        if (marca.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'La marca no existe'
            });
        }

        //create the product
        const createProduct = await db.query(`INSERT INTO producto (marca_id,proveedor_id, imagen, titulo, descripcion,estado) VALUES (${marca_id}, ${proveedor_id}, '${imagen}', '${titulo}', '${descripcion}',${true}) RETURNING *`);
        if (createProduct.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El producto no se pudo crear'
            });
        }
        
        let prodNeo = { titulo :   createProduct.rows[0].titulo, marca : marca.rows[0].nombre, producto_id : createProduct.rows[0].producto_id, proveedor_id :proveedor.rows[0].proveedor_id }
        //create product in neo4j
        const prodNoeResponse = producto.createProducto(prodNeo);

        return res.status(200).json({
            ok: true,
            message: 'Producto creado',
            producto: createProduct.rows[0],
            neo4j: prodNoeResponse
        });

    } catch (error) {
        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });

    }

}

const getProductById = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        //verify the existence of the product
        const product = await db.query(`SELECT * FROM producto WHERE producto_id = ${id}`);
        if (product.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El producto no existe'
            });
        }

        const proveedor = await db.query(`SELECT * FROM proveedor WHERE proveedor_id = ${product.rows[0].proveedor_id}`);
        const usuario = await db.query(`SELECT * FROM usuario WHERE usuario_id = ${proveedor.rows[0].usuario_id}`);
        const marca = await db.query(`SELECT * FROM marca WHERE marca_id = ${product.rows[0].marca_id}`);

        const producto = { 
            titulo : product.rows[0].titulo,
            imagen : product.rows[0].imagen,
            descripcion : product.rows[0].descripcion,
            marca : marca.rows[0].nombre,
            proveedor : usuario.rows[0].nombres + ' ' + usuario.rows[0].apellidos
        }

        const variants = await db.query(
        `SELECT v.variante_id,v.descripcion, o.imagen, v.caracteristicas, v.stock
        FROM variante v
        INNER JOIN foto_variante o
        on v.variante_id = o.variante_id
        where v.producto_id = ${product.rows[0].producto_id};`
        );
        if (variants.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El producto no tiene variantes'
            });
        }
        
        let variantsArray = [{variante_id : 0, descripcion : '', caracteristicas : '', stock : 0, imagenes : []}];
        for(let vari of variants.rows){
            let index = variantsArray.findIndex(x => x.variante_id === vari.variante_id);
            if (index === -1) {
                variantsArray.push({variante_id : vari.variante_id, descripcion : vari.descripcion, caracteristicas : vari.caracteristicas, stock : vari.stock, imagenes : [vari.imagen]});
            }
            else {
                variantsArray[index].imagenes.push(vari.imagen);
            }
        }
        //delete the first element
        variantsArray.shift();

        return res.status(200).json({
            ok: true,
            message: 'Producto encontrado',
            producto: producto,
            variantes: variantsArray
        });

    } catch (error) {

        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });
    }
}

const getAll = async (req = request, res = response) => {
    try {
        const products = await db.query(`SELECT * FROM producto`);
        console.log('Productos'.yellow,products.rows);
        
        if (products.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'No hay productos'
            });
        }

        let productos = [];
        for (let product of products.rows) {
   
            let proveedor = await db.query(`SELECT * FROM proveedor WHERE proveedor_id = ${product.proveedor_id}`);
           
            let usuario = await db.query(`SELECT * FROM usuario WHERE usuario_id = ${proveedor.rows[0].usuario_id}`);
       
            let marca = await db.query(`SELECT * FROM marca WHERE marca_id = ${product.marca_id}`);
            
            let variante = await db.query(`SELECT * FROM variante WHERE producto_id = ${product.producto_id}`);
            let stockTotal = 0;
            for(let variantStock of variante.rows){(stockTotal += parseInt(variantStock.stock))};
            productos.push({
                producto_id: product.producto_id,
                titulo: product.titulo,
                imagen: product.imagen,
                descripcion: product.descripcion,
                marca: marca.rows[0].nombre,
                proveedor: usuario.rows[0].nombres + ' ' + usuario.rows[0].apellidos,
                precio : variante.rows[0].precio,
                stockTotal : stockTotal
            });
        }

        return res.status(200).json({
            ok: true,
            message: 'Productos encontrados',
            productos : productos
        });
    } catch (error) {
        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });
    }

}

const addCategories = async (req = request, res = response) => {
    const { producto_id } = req.params;
    const { categoria_id } = req.body;
    try {
        //verify the existence of the product
        const product = await db.query(`SELECT * FROM producto WHERE producto_id = ${producto_id}`);
        if (product.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El producto no existe'
            });
        }

        //verify the existence of the category
        const categoria = await db.query(`SELECT * FROM categoria WHERE categoria_id = ${categoria_id}`);
        if (categoria.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: `'La categoria no existe'`
            });
        }

        //Verify if the product is already in the category
        const productInCategory = await db.query(`SELECT * FROM producto_categoria WHERE producto_id = ${producto_id} AND categoria_id = ${categoria_id}`);
        if (productInCategory.rowCount !== 0) {
            return res.status(400).json({
                ok: false,
                message: 'El producto ya esta asociado a la categoria'
            });
        }

        //add the category
        const addCategory = await db.query(`INSERT INTO producto_categoria (producto_id, categoria_id) VALUES (${producto_id}, ${categoria_id}) RETURNING *`);
        if (addCategory.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'La categoria no se pudo agregar'
            });
        }

        let prod_cat = { producto_id : producto_id, categoria_id : categoria_id};
        const respons = cateNeo.addCategoria(prod_cat);

        return res.status(200).json({
            ok: true,
            message: `La categoria ${categoria.rows[0].nombre} se agrego correctamente al producto : ${product.rows[0].titulo}`
        });
        
    } catch (error) {
        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });
    }
}

const getProductsByCategory = async (req = request, res = response) => {
    const { categoria_id } = req.params;
    try {
        //verify the existence of the category
        const categoria = await db.query(`SELECT * FROM categoria WHERE categoria_id = ${categoria_id}`);
        if (categoria.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'La categoria no existe'
            });
        }

        //get the products
        const cat_prod = await db.query(`SELECT * FROM producto_categoria WHERE categoria_id = ${categoria_id}`);
        if (cat_prod.rowCount === 0) {
            return res.status(200).json({
                ok: true,
                message: `No hay productos en esta categoria : ${categoria.rows[0].nombre}`
            });
        }

        let productos = [];
        for (let index in cat_prod.rows) {
            const product = await db.query(`SELECT * FROM producto WHERE producto_id = ${cat_prod.rows[index].producto_id}`);
            const variant = await db.query(`SELECT * FROM variante WHERE producto_id = ${cat_prod.rows[index].producto_id}`);
            let stockTotal = 0;
            for(let variantStock of variant.rows){(stockTotal += parseInt(variantStock.stock))};
            const proveedor = await db.query(`SELECT * FROM proveedor WHERE proveedor_id = ${product.rows[0].proveedor_id}`);
            const usuario = await db.query(`SELECT * FROM usuario WHERE usuario_id = ${proveedor.rows[0].usuario_id}`);
            const marca = await db.query(`SELECT * FROM marca WHERE marca_id = ${product.rows[0].marca_id}`);

            productos.push({
                producto_id : product.rows[0].producto_id,
                titulo : product.rows[0].titulo,
                imagen : product.rows[0].imagen,
                descripcion : product.rows[0].descripcion,
                marca : marca.rows[0].nombre,
                proveedor : usuario.rows[0].nombres + ' ' + usuario.rows[0].apellidos,
                precio : variant.rows[0].precio,
                stockTotal : stockTotal
            });
        }
        if (productos.length === 0) {
            return res.status(400).json({
                ok: true,
                message: 'error al obtener los productos'
            });
        }

        return res.status(200).json({
            ok: true,
            message: `Productos encontrados en la categoria : ${categoria.rows[0].nombre}`,
            cantidad : productos.length,
            productos: productos
        });
    } catch (error) {
        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });
    }
}

const productosProveedor = async (req = request, res = response) =>{
    let { proveedor_id } = req.params;
    proveedor_id = parseInt(proveedor_id);
    try {
        //verify the existence of the provider
        const proveedor = await db.query(`SELECT * FROM proveedor WHERE proveedor_id = ${proveedor_id}`);
        if (proveedor.rowCount === 0) {
            return res.status(400).json({
                ok: false,
                message: 'El proveedor no existe'
            });
        }
        
        //get the products
        const prov_prod = await db.query(`SELECT * FROM producto WHERE proveedor_id = ${proveedor_id}`);
        if (prov_prod.rowCount === 0) {
            return res.status(200).json({
                ok: true,
                message: `No hay productos en este proveedor : ${proveedor.rows[0].nombres}`
            });
        }
        let productos = [];
        for (let index of prov_prod.rows) {
            const variant = await db.query(`SELECT * FROM variante WHERE producto_id = ${index.producto_id}`);
            
            let stockTotal = 0;
            for(let variantStock of variant.rows){(stockTotal += parseInt(variantStock.stock))};
          
            const marca = await db.query(`SELECT * FROM marca WHERE marca_id = ${index.marca_id}`);
            
            const usuario = await db.query(`SELECT * FROM usuario WHERE usuario_id = ${proveedor.rows[0].usuario_id}`);
           
            productos.push({
                producto_id : index.producto_id,
                titulo : index.titulo,
                imagen : index.imagen,
                descripcion : index.descripcion,
                marca : marca.rows[0].nombre,
                proveedor : usuario.rows[0].nombres + ' ' + usuario.rows[0].apellidos,
                precio : variant.rows[0].precio,
                stockTotal : stockTotal
            });
        }

        if (productos.length === 0) {
            return res.status(400).json({
                ok: true,
                message: 'error al obtener los productos'
            });
        }

        return res.status(200).json({
            ok: true,
            message: `Productos encontrados en el proveedor : ${proveedor.rows[0].nombres}`,
            cantidad : productos.length,
            productos: productos
        });
    } catch (error) {
        return res.status(400).json({
            ok: false,
            message: 'Error en el servidor',
            error
        });
    }
}

module.exports = {
    uploadImg,
    create,
    getProductById,
    getAll,
    addCategories,
    getProductsByCategory,
    productosProveedor
}