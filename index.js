const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');


require("dotenv").config();

// middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: "Unauthorized Access" })
    }
    // bearer token
    const token = authorization.split(' ')[1];
    // console.log('Token Veriffy', token);

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gu0z5kw.mongodb.net/houseHunter?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db('thinsilDB').collection('users');
        const productsCollection = client.db('thinsilDB').collection('products');
        const cartCollection = client.db('thinsilDB').collection('cart');


        // JWT Post
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })

        // user related api
        app.get("/users", verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })


        // Admin Verify
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })


        //Update Admin Role 
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: "admin"
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        // User Added API in the MONGODB Database
        app.post('/users', async (req, res) => {
            try {
                const body = req.body;
                const existingUser = await usersCollection.findOne({ email: body.email });

                if (existingUser) {
                    return res.status(400).json({ error: "User already exists." });
                }

                const result = await usersCollection.insertOne(body);
                res.send(result)
            } catch (error) {
                console.error("Error during user signup:", error);
                res.status(500).json({ error: "An internal server error occurred." });
            }
        });



        // Create a product
        app.post('/products', async (req, res) => {
            try {
                const productData = req.body;

                const result = await productsCollection.insertOne(productData);

                res.status(201).json({ message: 'Product created successfully', productId: result.insertedId });
            } catch (error) {
                console.error("Error creating product:", error);
                res.status(500).json({ error: "An internal server error occurred." });
            }
        });

        // Search Products API
        app.get('/products', async (req, res) => {
            try {
                const searchQuery = req.query.search;
                let filter = {};

                if (searchQuery) {
                    filter = { name: { $regex: new RegExp(searchQuery, 'i') } };
                }

                const products = await productsCollection.find(filter).toArray();
                res.status(200).json(products);
            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).json({ error: 'An internal server error occurred.' });
            }
        });


        // Get all products
        app.get('/products', async (req, res) => {
            try {
                const products = await productsCollection.find().toArray();

                res.status(200).json(products);
            } catch (error) {
                console.error("Error fetching products:", error);
                res.status(500).json({ error: "An internal server error occurred." });
            }
        });

        // Get a single product by ID
        app.get('/products/:id', async (req, res) => {
            try {
                const productId = req.params.id;

                const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                if (!product) {
                    return res.status(404).json({ error: "Product not found" });
                }

                res.status(200).json(product);
            } catch (error) {
                console.error("Error fetching product:", error);
                res.status(500).json({ error: "An internal server error occurred." });
            }
        });

        // Update a product by ID
        app.put('/products/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updatedProduct = req.body;

                // Validate the request body (you can add more validation as needed)
                if (!updatedProduct.name || !updatedProduct.price || !updatedProduct.description) {
                    return res.status(400).json({ message: 'Invalid product data' });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: updatedProduct,
                };

                const result = await productsCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount === 1) {
                    return res.status(200).json({ message: 'Product updated successfully' });
                } else {
                    return res.status(404).json({ message: 'Product not found' });
                }
            } catch (error) {
                console.error('Error updating product:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }
        });



        // Delete a product by ID
        app.delete('/products/:id', async (req, res) => {
            try {
                const { id } = req.params;

                const filter = { _id: new ObjectId(id) };

                const result = await productsCollection.deleteOne(filter);

                if (result.deletedCount === 1) {
                    return res.status(200).json({ message: 'Product deleted successfully' });
                } else {
                    return res.status(404).json({ message: 'Product not found' });
                }
            } catch (error) {
                console.error('Error deleting product:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }
        });




        // Endpoint to add a product to the cart (without JWT authentication)
        app.post('/cart/add/:productId', async (req, res) => {
            try {
                const { productId } = req.params;
                const { email, quantity } = req.body; // Assuming email and quantity are sent in the request body

                // Convert quantity to a floating-point number
                const quantityFloat = parseFloat(quantity);

                if (isNaN(quantityFloat) || quantityFloat <= 0) {
                    return res.status(400).json({ message: 'Invalid quantity' });
                }

                // Fetch product details from the products collection
                const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                if (!product) {
                    return res.status(404).json({ message: 'Product not found' });
                }

                // Add the product and cart item to the cart collection in MongoDB
                const cartItem = {
                    productId: new ObjectId(productId),
                    product,
                    email,
                    quantity: quantityFloat,
                };

                await cartCollection.insertOne(cartItem);
                return res.status(200).json({ message: 'Product added to cart successfully' });
            } catch (error) {
                console.error('Error adding product to cart:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }
        });


        // Endpoint to get the user's cart items
        app.get('/cart/:email', async (req, res) => {
            try {
                const { email } = req.params;

                // Find all cart items associated with the user's email
                const userCart = await cartCollection.find({ email }).toArray();
                return res.status(200).json(userCart);
            } catch (error) {
                console.error('Error fetching cart items:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Add this route to your Express app
        app.delete('/cart/delete/:itemId', async (req, res) => {
            const { itemId } = req.params;

            try {
                const deleteResult = await cartCollection.deleteOne({ _id: new ObjectId(itemId) });

                if (deleteResult.deletedCount === 1) {
                    // Item successfully deleted
                    return res.status(200).json({ message: 'Item deleted from cart' });
                } else {
                    // Item not found or not deleted
                    return res.status(404).json({ message: 'Item not found' });
                }
            } catch (error) {
                console.error('Error deleting item from cart:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }
        });






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



// Ping Endpoint
app.get("/", (req, res) => {
    res.send("Ecommerce Server is running");
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});